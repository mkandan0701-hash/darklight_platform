"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "../../../../lib/auth/session";
import { requireRole } from "../../../../lib/auth/requireRole";
import { TenantMismatchError } from "../../../../lib/auth/errors";
import { zonedLocalToUtc } from "../../../../lib/time";
import { canStartSession } from "../../../../lib/liveSession";
import { parseMeetingUrl } from "../../../../lib/meetingLink";
import {
  createClassroom,
  assignCoach,
  enrollStudent,
  isCoachAssignedToClassroom,
  setClassroomMeetingUrl,
} from "../../../../repositories/classroomRepository";
import {
  cancelLiveSession,
  createLiveSession,
  getLiveSession,
  getLiveSessionWithAttendanceCount,
  markSessionStarted,
  setSessionMeetingUrl,
} from "../../../../repositories/liveSessionRepository";
import { getCoachProfileByUserId } from "../../../../repositories/userRepository";
import {
  createScheduleSlot,
  getScheduleSlot,
  materializeSlot,
  removeScheduleSlot,
} from "../../../../repositories/scheduleSlotRepository";

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
  // Checkbox inputs are only present in FormData when checked, so this is
  // "on"/undefined, not "true"/"false" — coerce accordingly rather than via
  // z.coerce.boolean(), which would treat the literal string "false" as truthy.
  weekendFirst: z
    .string()
    .optional()
    .transform((v) => v === "on"),
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

  await createClassroom(session.tenantId, parsed.data.name, parsed.data.weekendFirst);
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

  // The repository refuses ids belonging to another academy; this is the route
  // boundary that turns that into a message rather than a 500 (claude.md §7).
  try {
    await assignCoach(session.tenantId, parsed.data.classroomId, parsed.data.profileId);
  } catch (err) {
    if (err instanceof TenantMismatchError) {
      return { ok: false, error: "That coach or classroom isn't part of your academy" };
    }
    throw err;
  }
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

  try {
    await enrollStudent(session.tenantId, parsed.data.classroomId, parsed.data.profileId);
  } catch (err) {
    if (err instanceof TenantMismatchError) {
      return { ok: false, error: "That student or classroom isn't part of your academy" };
    }
    throw err;
  }
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
  // The management board lists sessions across rooms; the cancelled card must
  // leave it as well as the classroom page.
  revalidatePath("/dashboard/classrooms");
  return { ok: true };
}

const AddScheduleSlotSchema = z.object({
  classroomId: z.string().min(1),
  dayOfWeek: z.coerce.number().int().min(1).max(7),
  localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm"),
  timezone: z.string().min(1),
  durationMins: z.coerce.number().int().min(15).max(240),
});

export async function addScheduleSlotAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
  } catch {
    return { ok: false, error: "Only admins or coaches can edit the weekly schedule" };
  }

  const parsed = AddScheduleSlotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  if (!(await coachMayActOnClassroom(session, parsed.data.classroomId))) {
    return { ok: false, error: "You aren't assigned to this classroom" };
  }

  let slot;
  try {
    slot = await createScheduleSlot(session.tenantId, parsed.data.classroomId, {
      dayOfWeek: parsed.data.dayOfWeek,
      localTime: parsed.data.localTime,
      timezone: parsed.data.timezone,
      durationMins: parsed.data.durationMins,
    });
  } catch (err) {
    if (err instanceof TenantMismatchError) {
      return { ok: false, error: "That classroom isn't part of your academy" };
    }
    throw err;
  }

  // Immediate top-up so the coach sees upcoming classes right away, rather
  // than waiting for the nightly sweep. Cheap — one slot, an 8-week bounded
  // horizon — so no queue is warranted here (claude.md §3.7 is about
  // *expensive* work, not a handful of createMany rows).
  await materializeSlot(session.tenantId, slot);

  revalidatePath(`/dashboard/classrooms/${parsed.data.classroomId}`);
  return { ok: true };
}

const RemoveScheduleSlotSchema = z.object({
  classroomId: z.string().min(1),
  scheduleSlotId: z.string().min(1),
});

export async function removeScheduleSlotAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
  } catch {
    return { ok: false, error: "Only admins or coaches can edit the weekly schedule" };
  }

  const parsed = RemoveScheduleSlotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  if (!(await coachMayActOnClassroom(session, parsed.data.classroomId))) {
    return { ok: false, error: "You aren't assigned to this classroom" };
  }

  // Same nested-route consistency check cancelSessionAction makes: rights to
  // this classroom must not make a slot from another classroom removable by
  // supplying its id.
  const slot = await getScheduleSlot(session.tenantId, parsed.data.scheduleSlotId);
  if (!slot || slot.classroomId !== parsed.data.classroomId) {
    return { ok: false, error: "Schedule slot not found in this classroom" };
  }

  if (!(await removeScheduleSlot(session.tenantId, parsed.data.scheduleSlotId))) {
    return { ok: false, error: "Schedule slot not found" };
  }

  revalidatePath(`/dashboard/classrooms/${parsed.data.classroomId}`);
  return { ok: true };
}

const StartSessionSchema = z.object({
  classroomId: z.string().min(1),
  liveSessionId: z.string().min(1),
});

/**
 * "Start Classroom": records that the class began, then hands the coach the
 * page to go to. Coaches only — the shared board is the lesson, and the
 * socket admits only the classroom's coach and students to it (see
 * sessions/[liveSessionId]/page.tsx), so an admin "starting" a class they
 * can't enter would mark it held when nobody taught it.
 */
export async function startSessionAction(
  formData: FormData
): Promise<{ ok: true; href: string } | { ok: false; error: string }> {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["COACH"]);
  } catch {
    return { ok: false, error: "Only the class's coach can start it" };
  }

  const parsed = StartSessionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  if (!(await coachMayActOnClassroom(session, parsed.data.classroomId))) {
    return { ok: false, error: "You aren't assigned to this classroom" };
  }

  const liveSession = await getLiveSessionWithAttendanceCount(
    session.tenantId,
    parsed.data.liveSessionId
  );
  if (!liveSession || liveSession.classroomId !== parsed.data.classroomId) {
    return { ok: false, error: "Session not found in this classroom" };
  }

  if (!canStartSession(liveSession, { hasAttendance: liveSession._count.attendance > 0 })) {
    return {
      ok: false,
      error: "This class can be started from 15 minutes before its start time",
    };
  }

  await markSessionStarted(session.tenantId, liveSession.id);
  revalidatePath("/dashboard/classrooms");
  revalidatePath(`/dashboard/classrooms/${liveSession.classroomId}/sessions/${liveSession.id}`);
  return {
    ok: true,
    href: `/dashboard/classrooms/${liveSession.classroomId}/sessions/${liveSession.id}`,
  };
}

const MeetingUrlSchema = z.object({
  classroomId: z.string().min(1),
  liveSessionId: z.string().min(1).optional(),
  // Empty means "remove the link".
  meetingUrl: z.string().max(1000).optional().default(""),
});

/**
 * Sets (or clears) the video link on a classroom, or on one session when
 * liveSessionId is present. The link is shown to every student and parent in
 * the room, so it is validated here — https only — not just in the form.
 */
export async function setMeetingUrlAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
  } catch {
    return { ok: false, error: "Only admins or coaches can change the meeting link" };
  }

  const parsed = MeetingUrlSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  if (!(await coachMayActOnClassroom(session, parsed.data.classroomId))) {
    return { ok: false, error: "You aren't assigned to this classroom" };
  }

  let meetingUrl: string | null = null;
  if (parsed.data.meetingUrl.trim() !== "") {
    const link = parseMeetingUrl(parsed.data.meetingUrl);
    if (!link.ok) return { ok: false, error: link.error };
    meetingUrl = link.url;
  }

  const { classroomId, liveSessionId } = parsed.data;
  if (liveSessionId) {
    // Same nested-route check as cancelSessionAction.
    const liveSession = await getLiveSession(session.tenantId, liveSessionId);
    if (!liveSession || liveSession.classroomId !== classroomId) {
      return { ok: false, error: "Session not found in this classroom" };
    }
    await setSessionMeetingUrl(session.tenantId, liveSessionId, meetingUrl);
    revalidatePath(`/dashboard/classrooms/${classroomId}/sessions/${liveSessionId}`);
  } else {
    if (!(await setClassroomMeetingUrl(session.tenantId, classroomId, meetingUrl))) {
      return { ok: false, error: "Classroom not found" };
    }
    revalidatePath(`/dashboard/classrooms/${classroomId}`);
  }
  revalidatePath("/dashboard/classrooms");
  return { ok: true };
}
