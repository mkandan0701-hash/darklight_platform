import Link from "next/link";
import { getCurrentSession, type CurrentSession } from "../../../lib/auth/session";
import { formatInZone } from "../../../lib/time";
import { listClassroomsForViewer } from "../../../repositories/classroomRepository";
import { listUpcomingSessionsForClassrooms } from "../../../repositories/liveSessionRepository";
import {
  getParentProfileByUserId,
  getStudentProfileByUserId,
  listStudentsForParent,
} from "../../../repositories/userRepository";
import {
  getStudentSolvedPuzzleIds,
  listAssignmentsForStudent,
} from "../../../repositories/assignmentRepository";
import { getStudentAttendanceSummary } from "../../../repositories/attendanceRepository";
import { formatAttendanceRate } from "../../../lib/attendance";
import { displayName } from "../../../lib/displayName";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { RankProgressBar } from "../../../components/ui/RankProgressBar";
import { ChildSummaryCard } from "../../../components/dashboard/ChildSummaryCard";
import { SessionList } from "../../../components/dashboard/SessionList";
import { pageHeadingClass, sectionHeadingClass, textLinkClass } from "../../../components/ui/styles";

// Bounds the per-assignment status queries on the student and parent views —
// this is a landing page, not the homework list.
const ASSIGNMENT_PREVIEW_LIMIT = 5;
const SESSION_PREVIEW_LIMIT = 5;

function greeting(session: CurrentSession) {
  return displayName(session);
}

/**
 * How many of an assignment's puzzles this student has solved.
 *
 * Intersects against the assignment's *current* puzzles rather than counting
 * attempt rows: a puzzle dropped from an assignment after being solved leaves
 * its PuzzleAttempt behind, and a raw count would render as "3/2".
 */
function solvedCount(
  assignment: { id: string; puzzles: { puzzleId: string }[] },
  solvedByAssignment: Map<string, Set<string>>
): number {
  const solvedIds = solvedByAssignment.get(assignment.id);
  if (!solvedIds) return 0;
  return assignment.puzzles.filter((p) => solvedIds.has(p.puzzleId)).length;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <p className="font-display text-2xl font-bold text-ink">{value}</p>
      <p className="text-xs uppercase tracking-wide text-slate">{label}</p>
    </Card>
  );
}

export default async function DashboardHomePage() {
  const session = await getCurrentSession();
  const heading = (
    <div>
      <h1 className={pageHeadingClass}>Welcome back, {greeting(session)}</h1>
      <p className="mt-1 text-sm text-slate">
        {session.role.replace("_", " ").toLowerCase()} · times shown in {session.timezone}
      </p>
    </div>
  );

  // ---- STUDENT ----------------------------------------------------------
  if (session.role === "STUDENT") {
    const studentProfile = await getStudentProfileByUserId(session.tenantId, session.id);
    const assignments = studentProfile
      ? (await listAssignmentsForStudent(session.tenantId, studentProfile.id)).slice(
          0,
          ASSIGNMENT_PREVIEW_LIMIT
        )
      : [];

    // listAssignmentsForStudent already sorts by dueAtUtc ascending.
    // One query for the whole list, not one per assignment.
    const solvedByAssignment = studentProfile
      ? await getStudentSolvedPuzzleIds(
          session.tenantId,
          studentProfile.id,
          assignments.map((a) => a.id)
        )
      : new Map<string, Set<string>>();
    const withProgress = assignments.map((assignment) => ({
      assignment,
      solved: solvedCount(assignment, solvedByAssignment),
    }));

    const myClassrooms = await listClassroomsForViewer(session);
    const sessions = await listUpcomingSessionsForClassrooms(
      session.tenantId,
      myClassrooms.map((c) => c.id),
      SESSION_PREVIEW_LIMIT
    );
    const attendance = studentProfile
      ? await getStudentAttendanceSummary(session.tenantId, studentProfile.id)
      : { attendedCount: 0, sessionCount: 0 };

    return (
      <div>
        {heading}
        <section className="mt-8">
          <h2 className={sectionHeadingClass}>Attendance</h2>
          <Card className="mt-3 flex flex-wrap items-center justify-between gap-3 p-4">
            <RankProgressBar
              completed={attendance.attendedCount}
              total={attendance.sessionCount}
              label={`${attendance.attendedCount} of ${attendance.sessionCount} sessions attended`}
            />
            <span className="text-sm text-ink">
              {attendance.sessionCount === 0
                ? "No sessions marked yet."
                : `${formatAttendanceRate(attendance.attendedCount, attendance.sessionCount)} attended`}
            </span>
          </Card>
        </section>
        <section className="mt-8">
          <h2 className={sectionHeadingClass}>Your next sessions</h2>
          <SessionList
            sessions={sessions}
            timezone={session.timezone}
            emptyDescription="Your coach hasn't scheduled a class yet. It'll appear here in your own time zone."
          />
        </section>
        <section className="mt-8">
          <h2 className={sectionHeadingClass}>Homework</h2>
          {withProgress.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                title="Nothing due"
                description="No homework assigned yet. In the meantime you can play the engine or open the analysis board."
                action={
                  <Link href="/dashboard/play" className={textLinkClass}>
                    Play vs computer
                  </Link>
                }
              />
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {withProgress.map(({ assignment, solved }) => (
                <Card key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <Link href={`/dashboard/homework/${assignment.id}`} className={textLinkClass}>
                    {assignment.title}
                  </Link>
                  <div className="flex items-center gap-3">
                    {assignment.dueAtUtc && (
                      <span className="text-xs text-slate">
                        due {formatInZone(assignment.dueAtUtc, session.timezone)}
                      </span>
                    )}
                    <RankProgressBar completed={solved} total={assignment.puzzles.length} />
                  </div>
                </Card>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  // ---- PARENT -----------------------------------------------------------
  if (session.role === "PARENT") {
    const parentProfile = await getParentProfileByUserId(session.tenantId, session.id);
    const links = parentProfile
      ? await listStudentsForParent(session.tenantId, parentProfile.id)
      : [];

    const children = await Promise.all(
      links.map(async (link) => {
        const assignments = await listAssignmentsForStudent(session.tenantId, link.studentId);
        const preview = assignments.slice(0, ASSIGNMENT_PREVIEW_LIMIT);
        // One query per child rather than one per assignment per child.
        const solvedByAssignment = await getStudentSolvedPuzzleIds(
          session.tenantId,
          link.studentId,
          preview.map((a) => a.id)
        );
        const completedCount = preview.filter(
          (assignment) =>
            assignment.puzzles.length > 0 &&
            solvedCount(assignment, solvedByAssignment) === assignment.puzzles.length
        ).length;
        const attendance = await getStudentAttendanceSummary(session.tenantId, link.studentId);
        return {
          studentId: link.studentId,
          name: displayName(link.student.user),
          assignmentCount: assignments.length,
          completedCount,
          attendance,
        };
      })
    );

    return (
      <div>
        {heading}
        <section className="mt-8">
          <h2 className={sectionHeadingClass}>Your children</h2>
          {children.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                title="No students linked yet"
                description="Once your academy links your child's account to yours, their classes and homework progress will show up here."
              />
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {children.map((child) => (
                <ChildSummaryCard
                  key={child.studentId}
                  studentId={child.studentId}
                  name={child.name}
                  attendance={child.attendance}
                  homeworkDone={child.completedCount}
                  homeworkTotal={Math.min(child.assignmentCount, ASSIGNMENT_PREVIEW_LIMIT)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  // ---- COACH and ACADEMY_ADMIN ------------------------------------------
  // An admin oversees the academy; a coach sees only rooms they teach — both
  // come out of the repository's membership filter.
  const myClassrooms = await listClassroomsForViewer(session);
  const isAdmin = session.role === "ACADEMY_ADMIN";

  const sessions = await listUpcomingSessionsForClassrooms(
    session.tenantId,
    myClassrooms.map((c) => c.id),
    SESSION_PREVIEW_LIMIT
  );

  // Students can sit in more than one classroom, so count people not rows.
  const distinctStudents = new Set(
    myClassrooms.flatMap((c) => c.students.map((s) => s.studentId))
  ).size;
  const distinctCoaches = new Set(
    myClassrooms.flatMap((c) => c.coaches.map((cc) => cc.coachId))
  ).size;

  return (
    <div>
      {heading}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label={isAdmin ? "Classrooms" : "Your classrooms"} value={myClassrooms.length} />
        <Stat label="Students" value={distinctStudents} />
        <Stat label="Coaches" value={distinctCoaches} />
      </div>

      <section className="mt-8">
        <h2 className={sectionHeadingClass}>Upcoming sessions</h2>
        <SessionList
          sessions={sessions}
          timezone={session.timezone}
          emptyDescription={
            myClassrooms.length === 0
              ? isAdmin
                ? "Create a classroom first, then schedule your first session."
                : "You're not assigned to a classroom yet. Your academy admin can add you."
              : "Open a classroom to schedule the next session — students see it in their own time zone."
          }
        />
      </section>

      <section className="mt-8">
        <h2 className={sectionHeadingClass}>
          {isAdmin ? "Classrooms" : "Your classrooms"}
        </h2>
        {myClassrooms.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title={isAdmin ? "No classrooms yet" : "No classrooms assigned"}
              description={
                isAdmin
                  ? "Create your first classroom to start enrolling coaches and students."
                  : "Your academy admin hasn't assigned you to a classroom yet."
              }
              action={
                isAdmin ? (
                  <Link href="/dashboard/classrooms" className={textLinkClass}>
                    Create a classroom
                  </Link>
                ) : undefined
              }
            />
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {myClassrooms.map((classroom) => (
              <Card key={classroom.id} className="flex items-center justify-between gap-4 p-4">
                <Link href={`/dashboard/classrooms/${classroom.id}`} className={textLinkClass}>
                  {classroom.name}
                </Link>
                <span className="text-xs text-slate">
                  {classroom.students.length} students · {classroom.coaches.length} coaches
                </span>
              </Card>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
