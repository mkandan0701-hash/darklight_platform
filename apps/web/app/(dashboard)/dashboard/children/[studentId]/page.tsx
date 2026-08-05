import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentSession } from "../../../../../lib/auth/session";
import { requireRole } from "../../../../../lib/auth/requireRole";
import { displayName } from "../../../../../lib/displayName";
import { formatAttendanceRate } from "../../../../../lib/attendance";
import { formatInZone } from "../../../../../lib/time";
import { getChildForParent } from "../../../../../repositories/userRepository";
import { listClassroomsForStudent } from "../../../../../repositories/classroomRepository";
import { listUpcomingSessionsForClassrooms } from "../../../../../repositories/liveSessionRepository";
import {
  getStudentAttendanceDetail,
  getStudentAttendanceSummary,
} from "../../../../../repositories/attendanceRepository";
import {
  getStudentPuzzleStatuses,
  listAssignmentsForStudent,
} from "../../../../../repositories/assignmentRepository";
import { SessionList } from "../../../../../components/dashboard/SessionList";
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

const SESSION_PREVIEW_LIMIT = 5;
const ATTENDANCE_ROW_LIMIT = 20;

export default async function ChildDetailPage({
  params,
}: {
  params: { studentId: string };
}) {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["PARENT"]);
  } catch {
    notFound();
  }

  // The gate for everything below: a student id off the URL that isn't this
  // parent's child comes back null and 404s, indistinguishable from one that
  // doesn't exist. Every read after this point takes a plain profile id
  // precisely because this has already run.
  const child = await getChildForParent(session, params.studentId);
  if (!child) notFound();

  const name = displayName(child.user.email);

  const [attendance, attendanceRows, assignments, classrooms] = await Promise.all([
    getStudentAttendanceSummary(session.tenantId, child.id),
    getStudentAttendanceDetail(session.tenantId, child.id, ATTENDANCE_ROW_LIMIT),
    listAssignmentsForStudent(session.tenantId, child.id),
    listClassroomsForStudent(session.tenantId, child.id),
  ]);

  const withProgress = await Promise.all(
    assignments.map(async (assignment) => {
      const statuses = await getStudentPuzzleStatuses(
        session.tenantId,
        assignment.id,
        child.id
      );
      const solved = Array.from(statuses.values()).filter((s) => s === "solved").length;
      return { assignment, solved };
    })
  );

  const sessions = await listUpcomingSessionsForClassrooms(
    session.tenantId,
    classrooms.map((c) => c.id),
    SESSION_PREVIEW_LIMIT
  );

  return (
    <div>
      <p className="text-sm">
        <Link href="/dashboard/children" className={textLinkClass}>
          ← Your children
        </Link>
      </p>
      <h1 className={`${pageHeadingClass} mt-2`}>{name}</h1>
      <p className="mt-1 text-sm text-slate">
        {classrooms.length === 0
          ? "Not enrolled in a classroom yet."
          : classrooms.map((c) => c.name).join(" · ")}
      </p>

      <section className="mt-8">
        <h2 className={sectionHeadingClass}>Attendance</h2>
        <Card className="mt-3 flex flex-wrap items-center justify-between gap-3 p-4">
          <RankProgressBar
            completed={attendance.attendedCount}
            total={attendance.sessionCount}
            label={`${name} attended ${attendance.attendedCount} of ${attendance.sessionCount} sessions`}
          />
          <span className="text-sm text-ink">
            {attendance.sessionCount === 0
              ? "No sessions marked yet."
              : `${formatAttendanceRate(
                  attendance.attendedCount,
                  attendance.sessionCount
                )} attended`}
          </span>
        </Card>

        {attendanceRows.length > 0 && (
          <div className={`${tableWrapperClass} mt-3`}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className={theadRowClass}>
                  <th className={thClass}>Session</th>
                  <th className={thClass}>Class</th>
                  <th className={thClass}>Attended</th>
                </tr>
              </thead>
              <tbody>
                {attendanceRows.map((row) => (
                  <tr key={row.liveSessionId} className={tbodyRowClass}>
                    {/* The parent's own zone — the child sits in another one,
                        and so, usually, does the coach (claude.md §3.5). */}
                    <td className={tdClass}>
                      {formatInZone(row.scheduledAtUtc, session.timezone)}
                    </td>
                    <td className={tdClass}>{row.classroomName}</td>
                    <td className={tdClass}>
                      {row.present ? (
                        <span className="text-ink">Present</span>
                      ) : (
                        <span className="text-slate">Absent</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className={sectionHeadingClass}>Next sessions</h2>
        <SessionList
          sessions={sessions}
          timezone={session.timezone}
          emptyDescription={`No classes scheduled for ${name} yet. They'll appear here in your own time zone.`}
        />
      </section>

      <section className="mt-8">
        <h2 className={sectionHeadingClass}>Homework</h2>
        {withProgress.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="Nothing assigned yet"
              description={`When ${name}'s coach sets homework, their progress on it shows up here.`}
            />
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {withProgress.map(({ assignment, solved }) => (
              <Card
                key={assignment.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div>
                  <span className="font-medium text-ink">{assignment.title}</span>
                  <span className="ml-2 text-xs text-slate">
                    {assignment.classroom.name}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {assignment.dueAtUtc && (
                    <span className="text-xs text-slate">
                      due {formatInZone(assignment.dueAtUtc, session.timezone)}
                    </span>
                  )}
                  <RankProgressBar
                    completed={solved}
                    total={assignment.puzzles.length}
                    label={`${solved} of ${assignment.puzzles.length} puzzles solved`}
                  />
                </div>
              </Card>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
