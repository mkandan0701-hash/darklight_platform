import { prisma } from "@chessplay-clone/db";
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
