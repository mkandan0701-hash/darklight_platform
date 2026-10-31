import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentSession } from "../../../../../../lib/auth/session";
import { requireRole } from "../../../../../../lib/auth/requireRole";
import { formatInZone } from "../../../../../../lib/time";
import { displayName } from "../../../../../../lib/displayName";
import { getClassroomForViewer } from "../../../../../../repositories/classroomRepository";
import { getLiveSession } from "../../../../../../repositories/liveSessionRepository";
import { getAttendanceForSession } from "../../../../../../repositories/attendanceRepository";
import { MarkAttendanceForm, type RosterRow } from "../../MarkAttendanceForm";
import { pageHeadingClass, textLinkClass } from "../../../../../../components/ui/styles";

export default async function MarkAttendancePage({
  params,
}: {
  params: { classroomId: string; liveSessionId: string };
}) {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
  } catch {
    notFound();
  }

  // Membership-scoped, matching markAttendanceAction's own check — the form
  // this page renders was already refused for a classroom the coach isn't
  // assigned to, so without this the page offered a roster it couldn't submit.
  const [classroom, liveSession] = await Promise.all([
    getClassroomForViewer(session, params.classroomId),
    getLiveSession(session.tenantId, params.liveSessionId),
  ]);
  // Same nested-route consistency check the live session page makes: a session
  // id from another classroom must not render here.
  if (!classroom || !liveSession || liveSession.classroomId !== classroom.id) {
    notFound();
  }

  const existing = await getAttendanceForSession(session.tenantId, liveSession.id);
  const byStudent = new Map(existing.map((record) => [record.studentId, record]));

  // The roster is the source of rows, so a student with no record yet still
  // appears — defaulting to present, because marking the exceptions is faster
  // than ticking a full class.
  const roster: RosterRow[] = classroom.students.map((enrollment) => {
    const record = byStudent.get(enrollment.studentId);
    return {
      studentId: enrollment.studentId,
      name: displayName(enrollment.student.user),
      email: enrollment.student.user.email,
      present: record?.present ?? true,
      mode: (record?.mode as "ONLINE" | "OFFLINE") ?? "ONLINE",
      marked: record !== undefined,
    };
  });

  return (
    <div>
      <h1 className={pageHeadingClass}>
        {formatInZone(liveSession.scheduledAtUtc, session.timezone)}
      </h1>
      <p className="mt-1 text-sm text-slate">
        {classroom.name} ·{" "}
        <Link href={`/dashboard/attendance/${classroom.id}`} className={textLinkClass}>
          back to attendance
        </Link>
      </p>

      <div className="mt-6">
        <MarkAttendanceForm
          classroomId={classroom.id}
          liveSessionId={liveSession.id}
          roster={roster}
        />
      </div>
    </div>
  );
}
