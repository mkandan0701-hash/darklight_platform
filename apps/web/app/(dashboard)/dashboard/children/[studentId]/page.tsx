import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentSession } from "../../../../../lib/auth/session";
import { requireRole } from "../../../../../lib/auth/requireRole";
import { getChildForParent } from "../../../../../repositories/userRepository";
import { listClassroomsForStudent } from "../../../../../repositories/classroomRepository";
import { listUpcomingSessionsForClassrooms } from "../../../../../repositories/liveSessionRepository";
import {
  getStudentSolvedPuzzleIds,
  listAssignmentsForStudent,
} from "../../../../../repositories/assignmentRepository";
import {
  getStudentAttendanceDetail,
  getStudentAttendanceSummary,
} from "../../../../../repositories/attendanceRepository";
import { formatAttendanceRate, resolveStatus } from "../../../../../lib/attendance";
import { formatInZone } from "../../../../../lib/time";
import { displayName } from "../../../../../lib/displayName";
import { Card } from "../../../../../components/ui/Card";
import { Badge } from "../../../../../components/ui/Badge";
import { EmptyState } from "../../../../../components/ui/EmptyState";
import { RankProgressBar } from "../../../../../components/ui/RankProgressBar";
import { SessionList } from "../../../../../components/dashboard/SessionList";
import {
  pageHeadingClass,
  sectionHeadingClass,
  tableWrapperClass,
  tbodyRowClass,
  tdClass,
  thClass,
  theadRowClass,
  textLinkClass,
} from "../../../../../components/ui/styles";

const SESSION_PREVIEW_LIMIT = 5;
const ATTENDANCE_HISTORY_LIMIT = 20;

const STATUS_LABEL = {
  present: "Present",
  absent: "Absent",
  unmarked: "Not recorded",
} as const;

const STATUS_TONE = {
  present: "success",
  absent: "danger",
  unmarked: "neutral",
} as const;

export default async function ChildPage({ params }: { params: { studentId: string } }) {
  const session = await getCurrentSession();

  // Role first, so staff get a 404 rather than an empty page — they read this
  // data through their own classroom and attendance views, and admitting them
  // here would mean a second visibility rule to keep correct for no gain.
  try {
    requireRole(session, ["PARENT"]);
  } catch {
    notFound();
  }

  // The actual gate. Requires a *live* ParentStudent link — the tenant guard in
  // packages/db can't help, because someone else's child is in the same
  // academy. Null for a child that isn't theirs, so a guessed id is
  // indistinguishable from one that doesn't exist.
  const child = await getChildForParent(session, params.studentId);
  if (!child) notFound();

  const name = displayName(child.user.email);

  const classrooms = await listClassroomsForStudent(session.tenantId, child.id);
  const sessions = await listUpcomingSessionsForClassrooms(
    session.tenantId,
    classrooms.map((c) => c.id),
    SESSION_PREVIEW_LIMIT
  );

  const attendance = await getStudentAttendanceSummary(session.tenantId, child.id);
  const attendanceRows = await getStudentAttendanceDetail(
    session.tenantId,
    child.id,
    ATTENDANCE_HISTORY_LIMIT
  );

  const assignments = await listAssignmentsForStudent(session.tenantId, child.id);
  const solvedByAssignment = await getStudentSolvedPuzzleIds(
    session.tenantId,
    child.id,
    assignments.map((a) => a.id)
  );
  const homework = assignments.map((assignment) => {
    const solvedIds = solvedByAssignment.get(assignment.id);
    // Against the assignment's *current* puzzles: a puzzle dropped after being
    // solved leaves its attempt behind, and a raw count would read "3/2".
    const solved = solvedIds
      ? assignment.puzzles.filter((p) => solvedIds.has(p.puzzleId)).length
      : 0;
    return { assignment, solved };
  });
  const completedCount = homework.filter(
    ({ assignment, solved }) => assignment.puzzles.length > 0 && solved === assignment.puzzles.length
  ).length;

  return (
    <div>
      <Link href="/dashboard" className={`${textLinkClass} text-sm`}>
        ← All children
      </Link>
      <h1 className={`${pageHeadingClass} mt-2`}>{name}</h1>
      <p className="mt-1 text-sm text-slate">
        {classrooms.length === 0
          ? "Not enrolled in a classroom yet"
          : classrooms.map((c) => c.name).join(" · ")}
        {" · "}
        {/* Every time on this page is the parent's, not the coach's. */}
        times shown in {session.timezone}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="font-display text-2xl font-bold text-ink">
            {formatAttendanceRate(attendance.attendedCount, attendance.sessionCount)}
          </p>
          <p className="text-xs uppercase tracking-wide text-slate">Attendance</p>
        </Card>
        <Card className="p-4">
          <p className="font-display text-2xl font-bold text-ink">
            {homework.length === 0 ? "—" : `${completedCount}/${homework.length}`}
          </p>
          <p className="text-xs uppercase tracking-wide text-slate">Homework complete</p>
        </Card>
        <Card className="p-4">
          <p className="font-display text-2xl font-bold text-ink">
            {sessions.length === 0
              ? "—"
              : formatInZone(sessions[0].scheduledAtUtc, session.timezone)}
          </p>
          <p className="text-xs uppercase tracking-wide text-slate">Next class</p>
        </Card>
      </div>

      <section className="mt-8">
        <h2 className={sectionHeadingClass}>Next classes</h2>
        <SessionList
          sessions={sessions}
          timezone={session.timezone}
          emptyDescription={`No classes scheduled for ${name} yet. They'll appear here in your own time zone.`}
        />
      </section>

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
          <>
            <div className={tableWrapperClass}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={theadRowClass}>
                    <th className={thClass}>Class</th>
                    <th className={thClass}>Classroom</th>
                    <th className={thClass}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceRows.map((row) => {
                    // `marked` is why this can say "Not recorded" instead of
                    // accusing a child of missing a class nobody wrote down.
                    const status = resolveStatus(
                      row.marked ? { present: row.present } : undefined
                    );
                    return (
                      <tr key={row.liveSessionId} className={tbodyRowClass}>
                        <td className={tdClass}>
                          {formatInZone(row.scheduledAtUtc, session.timezone)}
                        </td>
                        <td className={tdClass}>{row.classroomName}</td>
                        <td className={tdClass}>
                          <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-slate">
              Rates count only classes the coach has marked, from the date{" "}
              {name} joined each classroom onwards.
            </p>
          </>
        )}
      </section>

      <section className="mt-8">
        <h2 className={sectionHeadingClass}>Homework</h2>
        {homework.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No homework yet"
              description={`${name}'s coach hasn't set any puzzles yet. Assignments and progress will show up here.`}
            />
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {homework.map(({ assignment, solved }) => (
              <Card
                key={assignment.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div>
                  <p className="font-medium text-ink">{assignment.title}</p>
                  <p className="text-xs text-slate">
                    {assignment.classroom.name}
                    {assignment.dueAtUtc && (
                      <> · due {formatInZone(assignment.dueAtUtc, session.timezone)}</>
                    )}
                  </p>
                </div>
                <RankProgressBar
                  completed={solved}
                  total={assignment.puzzles.length}
                  label={`${solved} of ${assignment.puzzles.length} puzzles solved`}
                />
              </Card>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
