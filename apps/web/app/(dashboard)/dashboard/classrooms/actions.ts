"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "../../../../lib/auth/session";
import { requireRole } from "../../../../lib/auth/requireRole";
import { zonedLocalToUtc } from "../../../../lib/time";
import {
  createClassroom,
  assignCoach,
  enrollStudent,
  isCoachAssignedToClassroom,
} from "../../../../repositories/classroomRepository";
import {
  cancelLiveSession,
  createLiveSession,
  getLiveSession,
} from "../../../../repositories/liveSessionRepository";
import { getCoachProfileByUserId } from "../../../../repositories/userRepository";

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Role says "staff"; this says "staff *in this room*".
 *
 * Same check markAttendanceAction and createAssignmentAction make. Without it
 * a coach can act on a classroom they don't teach just by supplying its id —
 * the write-path twin of the read bugs fixed in b87c3cf.
 */
async function coachMayActOnClassroom(
  session: { tenantId: string; id: string; role: string },
  classroomId: string
): Promise<boolean> {
  if (session.role !== "COACH") return true; // admins already cleared by requireRole
  const coachProfile = await getCoachProfileByUserId(session.tenantId, session.id);
  if (!coachProfile) return false;
  return isCoachAssignedToClassroom(session.tenantId, classroomId, coachProfile.id);
}

const CreateClassroomSchema = z.object({
  name: z.string().min(2, "Classroom name is required"),
});

export async function createClassroomAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["ACADEMY_ADMIN"]);
  } catch {
    return { ok: false, error: "Only academy admins can create classrooms" };
  }

  const parsed = CreateClassroomSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await createClassroom(session.tenantId, parsed.data.name);
  revalidatePath("/dashboard/classrooms");
  return { ok: true };
}

const RosterSchema = z.object({
  classroomId: z.string().min(1),
  profileId: z.string().min(1, "Profile id is required"),
});

export async function assignCoachAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["ACADEMY_ADMIN"]);
  } catch {
    return { ok: false, error: "Only academy admins can assign coaches" };
  }

  const parsed = RosterSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await assignCoach(session.tenantId, parsed.data.classroomId, parsed.data.profileId);
  revalidatePath(`/dashboard/classrooms/${parsed.data.classroomId}`);
  return { ok: true };
}

export async function enrollStudentAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["ACADEMY_ADMIN"]);
  } catch {
    return { ok: false, error: "Only academy admins can enroll students" };
  }

  const parsed = RosterSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await enrollStudent(session.tenantId, parsed.data.classroomId, parsed.data.profileId);
  revalidatePath(`/dashboard/classrooms/${parsed.data.classroomId}`);
  return { ok: true };
}

const ScheduleSessionSchema = z.object({
  classroomId: z.string().min(1),
  localDateTime: z.string().min(1, "Pick a date and time"),
  durationMins: z.coerce.number().int().min(15).max(240),
});

export async function scheduleSessionAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
  } catch {
    return { ok: false, error: "Only admins or coaches can schedule sessions" };
  }

  const parsed = ScheduleSessionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  if (!(await coachMayActOnClassroom(session, parsed.data.classroomId))) {
    return { ok: false, error: "You aren't assigned to this classroom" };
  }

  // Entered in the scheduler's own timezone, stored in UTC — every viewer
  // (student in PST, parent in EST) sees it converted to their own zone, not
  // the sender's. See lib/time.ts.
  let scheduledAtUtc: Date;
  try {
    scheduledAtUtc = zonedLocalToUtc(parsed.data.localDateTime, session.timezone);
  } catch {
    return { ok: false, error: "Invalid date/time" };
  }

  await createLiveSession({
    tenantId: session.tenantId,
    classroomId: parsed.data.classroomId,
    scheduledAtUtc,
    durationMins: parsed.data.durationMins,
  });
  revalidatePath(`/dashboard/classrooms/${parsed.data.classroomId}`);
  return { ok: true };
}

const CancelSessionSchema = z.object({
  classroomId: z.string().min(1),
  liveSessionId: z.string().min(1),
});

export async function cancelSessionAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
  } catch {
    return { ok: false, error: "Only admins or coaches can cancel sessions" };
  }

  const parsed = CancelSessionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  if (!(await coachMayActOnClassroom(session, parsed.data.classroomId))) {
    return { ok: false, error: "You aren't assigned to this classroom" };
  }

  // Nested-route consistency: holding rights to *this* classroom must not make
  // another classroom's session cancellable by passing its id. Same check the
  // attendance action makes.
  const liveSession = await getLiveSession(session.tenantId, parsed.data.liveSessionId);
  if (!liveSession || liveSession.classroomId !== parsed.data.classroomId) {
    return { ok: false, error: "Session not found in this classroom" };
  }

  if (!(await cancelLiveSession(session.tenantId, parsed.data.liveSessionId))) {
    return { ok: false, error: "Session not found" };
  }

  revalidatePath(`/dashboard/classrooms/${parsed.data.classroomId}`);
  return { ok: true };
}
