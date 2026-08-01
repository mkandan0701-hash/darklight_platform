"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "../../../../lib/auth/session";
import { requireRole } from "../../../../lib/auth/requireRole";
import { getCoachProfileByUserId } from "../../../../repositories/userRepository";
import {
  getClassroom,
  isCoachAssignedToClassroom,
} from "../../../../repositories/classroomRepository";
import { getLiveSession } from "../../../../repositories/liveSessionRepository";
import { markAttendance } from "../../../../repositories/attendanceRepository";

type ActionResult = { ok: true } | { ok: false; error: string };

const AttendanceRowSchema = z.object({
  studentId: z.string().min(1),
  present: z.boolean(),
  mode: z.enum(["ONLINE", "OFFLINE"]),
});

const MarkAttendanceSchema = z.object({
  classroomId: z.string().min(1),
  liveSessionId: z.string().min(1),
  rows: z.array(AttendanceRowSchema).min(1, "No students to mark"),
});

export async function markAttendanceAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
  } catch {
    return { ok: false, error: "Only coaches and academy admins can mark attendance" };
  }

  // The roster arrives as one hidden studentIds field per student plus a
  // present/mode pair keyed by that id, so an absent student (unchecked box,
  // which FormData omits entirely) is still represented.
  const studentIds = formData.getAll("studentIds").map(String);
  const parsed = MarkAttendanceSchema.safeParse({
    classroomId: formData.get("classroomId"),
    liveSessionId: formData.get("liveSessionId"),
    rows: studentIds.map((studentId) => ({
      studentId,
      present: formData.get(`present:${studentId}`) === "on",
      mode: formData.get(`mode:${studentId}`) ?? "ONLINE",
    })),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const classroom = await getClassroom(session.tenantId, parsed.data.classroomId);
  if (!classroom) {
    return { ok: false, error: "Classroom not found" };
  }

  // Role alone is not enough: without this any coach in the tenant could mark
  // any other coach's roster. Same check createAssignmentAction makes.
  if (session.role === "COACH") {
    const coachProfile = await getCoachProfileByUserId(session.tenantId, session.id);
    const assigned =
      coachProfile &&
      (await isCoachAssignedToClassroom(session.tenantId, classroom.id, coachProfile.id));
    if (!assigned) {
      return { ok: false, error: "You aren't assigned to this classroom" };
    }
  }

  // Nested-route consistency: a session id from another classroom must not be
  // markable just because the caller has rights to *this* classroom.
  const liveSession = await getLiveSession(session.tenantId, parsed.data.liveSessionId);
  if (!liveSession || liveSession.classroomId !== classroom.id) {
    return { ok: false, error: "Session not found in this classroom" };
  }

  // Only students actually enrolled here can be marked, whatever ids the form
  // carried.
  const enrolled = new Set(classroom.students.map((s) => s.studentId));
  const rows = parsed.data.rows.filter((row) => enrolled.has(row.studentId));
  if (rows.length === 0) {
    return { ok: false, error: "None of those students are enrolled in this classroom" };
  }

  await markAttendance(session.tenantId, parsed.data.liveSessionId, rows);

  revalidatePath(`/dashboard/attendance/${classroom.id}`);
  revalidatePath(`/dashboard/attendance/${classroom.id}/${parsed.data.liveSessionId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}
