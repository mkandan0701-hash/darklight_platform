import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentSession } from "../../../../../lib/auth/session";
import { requireRole } from "../../../../../lib/auth/requireRole";
import { formatInZone } from "../../../../../lib/time";
import { formatAttendanceRate } from "../../../../../lib/attendance";
import { getClassroom } from "../../../../../repositories/classroomRepository";
import { listSessionsForClassroom } from "../../../../../repositories/liveSessionRepository";
import { getClassroomAttendanceReport } from "../../../../../repositories/attendanceRepository";
import { getAttendanceForSession } from "../../../../../repositories/attendanceRepository";
import { Card } from "../../../../../components/ui/Card";
import { EmptyState } from "../../../../../components/ui/EmptyState";
import { RankProgressBar } from "../../../../../components/ui/RankProgressBar";
import {
  pageHeadingClass,
  sectionHeadingClass,
  tableWrapperClass,
  tbodyRowClass,
  tdClass,
  textLinkClass,
  thClass,
  theadRowClass,
} from "../../../../../components/ui/styles";

const SESSION_LIMIT = 20;

export default async function ClassroomAttendancePage({
  params,
}: {
  params: { classroomId: string };
}) {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
  } catch {
    notFound();
  }

  const classroom = await getClassroom(session.tenantId, params.classroomId);
  if (!classroom) notFound();

  const [report, sessions] = await Promise.all([
    getClassroomAttendanceReport(session.tenantId, classroom.id),
    listSessionsForClassroom(session.tenantId, classroom.id, SESSION_LIMIT),
  ]);

  // One query per listed session, bounded by SESSION_LIMIT — just enough to
  // show which are still unmarked, which is the coach's actual to-do list.
  const marked = await Promise.all(
    sessions.map(async (liveSession) => ({
      liveSession,
      count: (await getAttendanceForSession(session.tenantId, liveSession.id)).length,
    }))
  );

  return (
    <div>
      <h1 className={pageHeadingClass}>{classroom.name}</h1>
      <p className="mt-1 text-sm text-slate">Attendance</p>

      <section className="mt-8">
        <h2 className={sectionHeadingClass}>Who&rsquo;s turning up</h2>
        <div className={tableWrapperClass}>
          <table className="w-full text-sm">
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>Student</th>
                <th className={thClass}>Attended</th>
                <th className={thClass}>Rate</th>
              </tr>
            </thead>
            <tbody>
              {report?.map((row) => (
                <tr key={row.studentId} className={tbodyRowClass}>
                  <td className={tdClass}>{row.email}</td>
                  <td className={tdClass}>
                    <RankProgressBar
                      completed={row.attendedCount}
                      total={row.sessionCount}
                      label={`${row.attendedCount} of ${row.sessionCount} sessions attended`}
                    />
                  </td>
                  <td className={tdClass}>
                    {formatAttendanceRate(row.attendedCount, row.sessionCount)}
                  </td>
                </tr>
              ))}
              {(!report || report.length === 0) && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-sm text-slate">
                    No students enrolled in this classroom yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate">
          Rates count only sessions that have been marked, from each student&rsquo;s enrolment
          date onward — an unmarked class isn&rsquo;t an absence.
        </p>
      </section>

      <section className="mt-8">
        <h2 className={sectionHeadingClass}>Sessions</h2>
        {marked.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No sessions yet"
              description="Schedule a session on the classroom page — you can mark attendance once it exists."
              action={
                <Link href={`/dashboard/classrooms/${classroom.id}`} className={textLinkClass}>
                  Open classroom
                </Link>
              }
            />
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {marked.map(({ liveSession, count }) => (
              <Card
                key={liveSession.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <Link
                  href={`/dashboard/attendance/${classroom.id}/${liveSession.id}`}
                  className={textLinkClass}
                >
                  {/* The viewer's own zone, never the scheduler's. */}
                  {formatInZone(liveSession.scheduledAtUtc, session.timezone)}
                </Link>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    count > 0 ? "bg-board-light text-board-dark" : "bg-parchment text-slate"
                  }`}
                >
                  {count > 0 ? `${count} marked` : "Not marked"}
                </span>
              </Card>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
