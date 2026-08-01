import { prisma } from "@chessplay-clone/db";
import { countAttendance, type MarkedSession } from "../lib/attendance";

export type AttendanceMode = "ONLINE" | "OFFLINE";

export type AttendanceInput = {
  studentId: string;
  present: boolean;
  mode: AttendanceMode;
};

export async function getAttendanceForSession(tenantId: string, liveSessionId: string) {
  return prisma.attendanceRecord.findMany({
    where: { tenantId, liveSessionId },
    select: { studentId: true, present: true, mode: true, markedAtUtc: true },
  });
}

/**
 * Marks (or re-marks) a whole roster for one session.
 *
 * Deliberately NOT an upsert. AttendanceRecord's unique key is the composite
 * @@unique([liveSessionId, studentId]), so an upsert's `where` is
 * `{ liveSessionId_studentId: {...} }` — which carries no top-level tenantId.
 * tenantScope guards `upsert` on both sides and refuses a where it can't find
 * a matching tenantId in, so the call would throw every time. Same failure
 * mode as the createLiveSession bug.
 *
 * Also not delete-and-recreate: CLAUDE.md §4 wants an audit trail, and
 * markedAtUtc is more useful as "when this was last corrected" than as
 * "when the row happened to be reinserted".
 */
export async function markAttendance(
  tenantId: string,
  liveSessionId: string,
  rows: AttendanceInput[]
) {
  if (rows.length === 0) return;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.attendanceRecord.findMany({
      where: { tenantId, liveSessionId },
      select: { studentId: true },
    });
    const alreadyMarked = new Set(existing.map((r) => r.studentId));

    const toCreate = rows.filter((r) => !alreadyMarked.has(r.studentId));
    if (toCreate.length > 0) {
      await tx.attendanceRecord.createMany({
        // tenantId on every item — createMany is guarded per-item.
        data: toCreate.map((r) => ({
          tenantId,
          liveSessionId,
          studentId: r.studentId,
          present: r.present,
          mode: r.mode,
        })),
      });
    }

    // Group the updates by their (present, mode) pair so a roster of any size
    // costs at most four updateMany calls rather than one per student.
    const toUpdate = rows.filter((r) => alreadyMarked.has(r.studentId));
    const groups = new Map<string, { present: boolean; mode: AttendanceMode; ids: string[] }>();
    for (const row of toUpdate) {
      const key = `${row.present}:${row.mode}`;
      const group = groups.get(key) ?? { present: row.present, mode: row.mode, ids: [] };
      group.ids.push(row.studentId);
      groups.set(key, group);
    }

    for (const group of groups.values()) {
      await tx.attendanceRecord.updateMany({
        where: { tenantId, liveSessionId, studentId: { in: group.ids } },
        data: { present: group.present, mode: group.mode, markedAtUtc: new Date() },
      });
    }
  });
}

export type AttendanceReportRow = {
  studentId: string;
  email: string;
  attendedCount: number;
  sessionCount: number;
};

/**
 * Roster × attendance for a classroom.
 *
 * Follows the shape getAssignmentCompletionForClassroom established: the
 * roster is the row source, so a student with no records still appears rather
 * than vanishing; the facts come from a separate narrow findMany; the join
 * happens in JS. Deliberately no groupBy/aggregate — neither is in
 * tenantScope's guarded operation list, so both would silently bypass tenant
 * isolation.
 */
export async function getClassroomAttendanceReport(
  tenantId: string,
  classroomId: string
): Promise<AttendanceReportRow[] | null> {
  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId, tenantId, deletedAt: null },
    include: { students: { include: { student: { include: { user: true } } } } },
  });
  if (!classroom) return null;

  const records = await prisma.attendanceRecord.findMany({
    where: { tenantId, liveSession: { classroomId } },
    select: {
      liveSessionId: true,
      studentId: true,
      present: true,
      liveSession: { select: { scheduledAtUtc: true } },
    },
  });

  const { markedSessions, presentByStudent } = foldAttendanceRecords(records);

  return classroom.students.map((enrollment) => ({
    studentId: enrollment.studentId,
    email: enrollment.student.user.email,
    ...countAttendance({
      enrolledAt: enrollment.enrolledAt,
      markedSessions,
      presentSessionIds: presentByStudent.get(enrollment.studentId) ?? new Set(),
    }),
  }));
}

/** One student's numbers across every classroom they're enrolled in. */
export async function getStudentAttendanceSummary(
  tenantId: string,
  studentProfileId: string
): Promise<{ attendedCount: number; sessionCount: number }> {
  const enrollments = await prisma.classroomStudent.findMany({
    where: { tenantId, studentId: studentProfileId },
    select: { classroomId: true, enrolledAt: true },
  });
  if (enrollments.length === 0) return { attendedCount: 0, sessionCount: 0 };

  const records = await prisma.attendanceRecord.findMany({
    where: {
      tenantId,
      liveSession: { classroomId: { in: enrollments.map((e) => e.classroomId) } },
    },
    select: {
      liveSessionId: true,
      studentId: true,
      present: true,
      liveSession: { select: { scheduledAtUtc: true, classroomId: true } },
    },
  });

  // Each classroom is counted against its own enrolment date, then summed —
  // a student who joined one class in January and another in June shouldn't
  // be judged against either date alone.
  let attendedCount = 0;
  let sessionCount = 0;
  for (const enrollment of enrollments) {
    const scoped = records.filter(
      (r) => r.liveSession.classroomId === enrollment.classroomId
    );
    const { markedSessions, presentByStudent } = foldAttendanceRecords(scoped);
    const counts = countAttendance({
      enrolledAt: enrollment.enrolledAt,
      markedSessions,
      presentSessionIds: presentByStudent.get(studentProfileId) ?? new Set(),
    });
    attendedCount += counts.attendedCount;
    sessionCount += counts.sessionCount;
  }
  return { attendedCount, sessionCount };
}

type RawRecord = {
  liveSessionId: string;
  studentId: string;
  present: boolean;
  liveSession: { scheduledAtUtc: Date };
};

/**
 * A session appears in `markedSessions` because *somebody* was marked for it.
 * That is what makes it count toward a denominator: unmarked sessions never
 * produce a record, so they can never make anyone look absent.
 */
function foldAttendanceRecords(records: RawRecord[]) {
  const sessions = new Map<string, MarkedSession>();
  const presentByStudent = new Map<string, Set<string>>();

  for (const record of records) {
    sessions.set(record.liveSessionId, {
      liveSessionId: record.liveSessionId,
      scheduledAtUtc: record.liveSession.scheduledAtUtc,
    });
    if (record.present) {
      const seen = presentByStudent.get(record.studentId) ?? new Set<string>();
      seen.add(record.liveSessionId);
      presentByStudent.set(record.studentId, seen);
    }
  }

  return { markedSessions: [...sessions.values()], presentByStudent };
}
