"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "../../../../lib/auth/session";
import { requireRole } from "../../../../lib/auth/requireRole";
import { TenantMismatchError } from "../../../../lib/auth/errors";
import { zonedLocalToUtc } from "../../../../lib/time";
import { scorePuzzleAttempt } from "../../../../lib/puzzles/scorePuzzleAttempt";
import {
  getCoachProfileByUserId,
  getStudentProfileByUserId,
} from "../../../../repositories/userRepository";
import { getClassroom, isCoachAssignedToClassroom } from "../../../../repositories/classroomRepository";
import {
  createAssignment,
  getAssignment,
  recordPuzzleAttempt,
} from "../../../../repositories/assignmentRepository";
import { awardXpSafely } from "../../../../repositories/gamificationRepository";

type ActionResult = { ok: true } | { ok: false; error: string };

const CreateAssignmentSchema = z.object({
  classroomId: z.string().min(1),
  title: z.string().min(2, "Title is required"),
  dueLocalDateTime: z.string().optional(),
  puzzleIds: z.array(z.string().min(1)).min(1, "Pick at least one puzzle"),
});

export async function createAssignmentAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
  } catch {
    return { ok: false, error: "Only coaches and academy admins can create assignments" };
  }

  const parsed = CreateAssignmentSchema.safeParse({
    classroomId: formData.get("classroomId"),
    title: formData.get("title"),
    dueLocalDateTime: formData.get("dueLocalDateTime") || undefined,
    puzzleIds: formData.getAll("puzzleIds"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const classroom = await getClassroom(session.tenantId, parsed.data.classroomId);
  if (!classroom) {
    return { ok: false, error: "Classroom not found" };
  }

  // Every existing classroom-write action is ACADEMY_ADMIN-only, so ownership
  // was never checked beyond role. COACH can write here, so verify the acting
  // coach is actually assigned to this classroom before creating anything.
  if (session.role === "COACH") {
    const coachProfile = await getCoachProfileByUserId(session.tenantId, session.id);
    const assigned =
      coachProfile &&
      (await isCoachAssignedToClassroom(session.tenantId, classroom.id, coachProfile.id));
    if (!assigned) {
      return { ok: false, error: "You aren't assigned to this classroom" };
    }
  }

  let dueAtUtc: Date | null = null;
  if (parsed.data.dueLocalDateTime) {
    try {
      dueAtUtc = zonedLocalToUtc(parsed.data.dueLocalDateTime, session.timezone);
    } catch {
      return { ok: false, error: "Invalid due date/time" };
    }
  }

  try {
    await createAssignment(session.tenantId, {
      classroomId: parsed.data.classroomId,
      title: parsed.data.title,
      dueAtUtc,
      puzzleIds: parsed.data.puzzleIds,
    });
  } catch (err) {
    // Raised when a puzzle id is neither global nor this academy's own upload.
    if (err instanceof TenantMismatchError) {
      return { ok: false, error: "One or more puzzles aren't available to your academy" };
    }
    throw err;
  }
  revalidatePath("/dashboard/homework");
  return { ok: true };
}

const SubmitAttemptSchema = z.object({
  assignmentId: z.string().min(1),
  puzzleId: z.string().min(1),
  submittedMoves: z.array(z.string().min(4).max(5)),
  timeTakenSecs: z.coerce.number().int().min(0),
});

type SubmitAttemptInput = z.input<typeof SubmitAttemptSchema>;
type SubmitAttemptResult =
  | { ok: true; isCorrect: boolean; firstMismatchIndex: number }
  | { ok: false; error: string };

export async function submitPuzzleAttemptAction(
  input: SubmitAttemptInput
): Promise<SubmitAttemptResult> {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["STUDENT"]);
  } catch {
    return { ok: false, error: "Only students can submit puzzle attempts" };
  }

  const parsed = SubmitAttemptSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid attempt data" };
  }

  const studentProfile = await getStudentProfileByUserId(session.tenantId, session.id);
  if (!studentProfile) {
    return { ok: false, error: "No student profile for this account" };
  }

  // No existing student-facing action to copy this check from — the closest
  // analog (canAccessLiveSession) lives in apps/api's socket code. Without
  // this, any student could submit attempts against any assignment/puzzle
  // pair just by guessing ids.
  const assignment = await getAssignment(session.tenantId, parsed.data.assignmentId);
  if (!assignment) {
    return { ok: false, error: "Assignment not found" };
  }
  const isEnrolled = assignment.classroom.students.some(
    (s) => s.studentId === studentProfile.id
  );
  if (!isEnrolled) {
    return { ok: false, error: "You aren't enrolled in this assignment's classroom" };
  }
  const assignmentPuzzle = assignment.puzzles.find((ap) => ap.puzzleId === parsed.data.puzzleId);
  if (!assignmentPuzzle) {
    return { ok: false, error: "This puzzle isn't part of that assignment" };
  }

  // Never trust a client-sent correctness flag — recompute from the puzzle's
  // real stored solution.
  const { isCorrect, firstMismatchIndex } = scorePuzzleAttempt({
    solutionMoves: assignmentPuzzle.puzzle.moves,
    submittedMoves: parsed.data.submittedMoves,
  });

  await recordPuzzleAttempt(session.tenantId, {
    studentId: studentProfile.id,
    puzzleId: parsed.data.puzzleId,
    assignmentId: parsed.data.assignmentId,
    attemptMoves: parsed.data.submittedMoves,
    isCorrect,
    timeTakenSecs: parsed.data.timeTakenSecs,
  });

  if (isCorrect) {
    // Keyed on the puzzle, not the attempt: every attempt is logged (§11), so
    // keying on the attempt would pay out again each time a student re-solved
    // a puzzle they had already cracked.
    await awardXpSafely({
      tenantId: session.tenantId,
      studentId: studentProfile.id,
      kind: "PUZZLE_SOLVED",
      sourceId: parsed.data.puzzleId,
    });
  }

  revalidatePath(`/dashboard/homework/${parsed.data.assignmentId}`);
  revalidatePath(`/dashboard/homework/${parsed.data.assignmentId}/puzzle/${parsed.data.puzzleId}`);
  return { ok: true, isCorrect, firstMismatchIndex };
}
