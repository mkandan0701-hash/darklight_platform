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
} from "../../../../repositories/classroomRepository";
import { createLiveSession } from "../../../../repositories/liveSessionRepository";

type ActionResult = { ok: true } | { ok: false; error: string };

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
