import { prisma } from "@chessplay-clone/db";
import { TenantMismatchError } from "../lib/auth/errors";
import {
  visibleClassroomWhere,
  type ClassroomViewer,
} from "./classroomRepository";

const ASSIGNMENT_INCLUDE = {
  puzzles: { include: { puzzle: true } },
  classroom: { include: { students: true } },
};

export async function createAssignment(
  tenantId: string,
  input: { classroomId: string; title: string; dueAtUtc: Date | null; puzzleIds: string[] }
) {
  // Puzzle is exempt from the tenant-scoping guard (it mixes global LICHESS
  // rows with private UPLOAD ones), so nothing else stops a puzzleId from
  // another academy's uploads being assigned here. The rule below is exactly
  // what listAssignablePuzzles offers the picker — global, or ours.
  if (input.puzzleIds.length > 0) {
    const assignable = await prisma.puzzle.findMany({
      where: {
        id: { in: input.puzzleIds },
        OR: [{ tenantId: null }, { tenantId }],
      },
      select: { id: true },
    });
    if (assignable.length !== new Set(input.puzzleIds).size) {
      // The whole create is refused rather than the offending ids dropped: a
      // coach who picked ten puzzles and silently got six would only find out
      // from a student.
      throw new TenantMismatchError(
        "One or more puzzles are not available to this academy"
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const assignment = await tx.assignment.create({
      data: {
        tenantId,
        classroomId: input.classroomId,
        title: input.title,
        dueAtUtc: input.dueAtUtc,
      },
    });
    await tx.assignmentPuzzle.createMany({
      data: input.puzzleIds.map((puzzleId) => ({
        tenantId,
        assignmentId: assignment.id,
        puzzleId,
      })),
    });
    return assignment;
  });
}

export async function listAssignmentsForClassroom(tenantId: string, classroomId: string) {
  return prisma.assignment.findMany({
    where: { tenantId, classroomId },
    include: { puzzles: { include: { puzzle: true } } },
    orderBy: { createdAt: "desc" },
  });
}

// Tenant-scoped but NOT membership-scoped — same contract as getClassroom.
// The two write paths that use it (submitPuzzleAttemptAction, and the puzzle
// attempt page) do their own roster check against the returned classroom,
// which is a stricter test than membership: it names the exact student.
export async function getAssignment(tenantId: string, assignmentId: string) {
  return prisma.assignment.findFirst({
    where: { id: assignmentId, tenantId },
    include: ASSIGNMENT_INCLUDE,
  });
}

// Null for an assignment in a classroom the viewer isn't in.
//
// The student half of the detail page always verified enrolment; the
// coach/admin half checked role only, so any coach could read any assignment
// in the academy and, with it, every student's completion row — names and
// solved counts for a class they don't teach.
export async function getAssignmentForViewer(
  viewer: ClassroomViewer,
  assignmentId: string
) {
  return prisma.assignment.findFirst({
    where: {
      id: assignmentId,
      tenantId: viewer.tenantId,
      classroom: visibleClassroomWhere(viewer),
    },
    include: ASSIGNMENT_INCLUDE,
  });
}

export async function listAssignmentsForStudent(tenantId: string, studentProfileId: string) {
  return prisma.assignment.findMany({
    where: { tenantId, classroom: { students: { some: { studentId: studentProfileId } } } },
    include: { puzzles: { include: { puzzle: true } }, classroom: true },
    orderBy: { dueAtUtc: "asc" },
  });
}

// Roster x solved-count for the coach/admin completion view. A puzzle counts
// as solved for a student the first time any of their attempts on it (within
// this assignment) was correct — students who haven't attempted anything yet
// still appear in the result with solvedCount 0, since they come from the
// classroom roster, not from the attempts table.
export async function getAssignmentCompletionForClassroom(tenantId: string, assignmentId: string) {
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, tenantId },
    include: {
      puzzles: true,
      classroom: {
        include: { students: { include: { student: { include: { user: true } } } } },
      },
    },
  });
  if (!assignment) return null;

  const correctAttempts = await prisma.puzzleAttempt.findMany({
    where: { tenantId, assignmentId, isCorrect: true },
    distinct: ["studentId", "puzzleId"],
    select: { studentId: true },
  });
  const solvedCounts = new Map<string, number>();
  for (const attempt of correctAttempts) {
    solvedCounts.set(attempt.studentId, (solvedCounts.get(attempt.studentId) ?? 0) + 1);
  }

  const totalPuzzles = assignment.puzzles.length;
  return assignment.classroom.students.map((enrollment) => ({
    studentId: enrollment.studentId,
    email: enrollment.student.user.email,
    solvedCount: solvedCounts.get(enrollment.studentId) ?? 0,
    totalPuzzles,
  }));
}

export async function getStudentPuzzleStatuses(
  tenantId: string,
  assignmentId: string,
  studentProfileId: string
): Promise<Map<string, "solved" | "attempted" | "unattempted">> {
  const attempts = await prisma.puzzleAttempt.findMany({
    where: { tenantId, assignmentId, studentId: studentProfileId },
    select: { puzzleId: true, isCorrect: true },
  });

  const statuses = new Map<string, "solved" | "attempted" | "unattempted">();
  for (const attempt of attempts) {
    if (attempt.isCorrect) {
      statuses.set(attempt.puzzleId, "solved");
    } else if (statuses.get(attempt.puzzleId) !== "solved") {
      statuses.set(attempt.puzzleId, "attempted");
    }
  }
  return statuses;
}

/**
 * Solved puzzle ids for one student across many assignments, in a single query.
 *
 * `getStudentPuzzleStatuses` answers the same question for *one* assignment, so
 * any page listing N assignments with progress ran N queries. The dashboard
 * capped that at five by only previewing five; the parent portal shows a
 * child's whole homework list, where the cap would be the wrong fix.
 *
 * Returns ids rather than a count deliberately. A puzzle removed from an
 * assignment after a student solved it leaves the `PuzzleAttempt` behind while
 * the `AssignmentPuzzle` goes, so a raw count can exceed
 * `assignment.puzzles.length` — `RankProgressBar` clamps its bar but prints the
 * raw numbers, and a parent would read "3/2". Intersecting against the
 * assignment's current puzzles is what the student's own assignment page
 * already does.
 *
 * Tenant-scoped but not viewer-scoped: callers must already have established
 * that they may read this student (see `getChildForParent`), the same contract
 * as `getAssignment` above.
 */
export async function getStudentSolvedPuzzleIds(
  tenantId: string,
  studentProfileId: string,
  assignmentIds: string[]
): Promise<Map<string, Set<string>>> {
  const solved = new Map<string, Set<string>>();
  // Prisma would turn an empty `in` into a query that cannot match anything.
  if (assignmentIds.length === 0) return solved;

  const correctAttempts = await prisma.puzzleAttempt.findMany({
    where: {
      tenantId,
      studentId: studentProfileId,
      assignmentId: { in: assignmentIds },
      isCorrect: true,
    },
    distinct: ["assignmentId", "puzzleId"],
    select: { assignmentId: true, puzzleId: true },
  });

  for (const attempt of correctAttempts) {
    const forAssignment = solved.get(attempt.assignmentId) ?? new Set<string>();
    forAssignment.add(attempt.puzzleId);
    solved.set(attempt.assignmentId, forAssignment);
  }
  return solved;
}

// Called on every submitted move, not just the final/correct one — logging
// every attempt (right or wrong) is a stated product differentiator.
export async function recordPuzzleAttempt(
  tenantId: string,
  input: {
    studentId: string;
    puzzleId: string;
    assignmentId: string;
    attemptMoves: string[];
    isCorrect: boolean;
    timeTakenSecs: number;
  }
) {
  return prisma.puzzleAttempt.create({
    data: {
      tenantId,
      studentId: input.studentId,
      puzzleId: input.puzzleId,
      assignmentId: input.assignmentId,
      attemptMoves: input.attemptMoves,
      isCorrect: input.isCorrect,
      timeTakenSecs: input.timeTakenSecs,
    },
  });
}
