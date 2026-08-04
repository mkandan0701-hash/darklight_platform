import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentSession } from "../../../../../lib/auth/session";
import { requireRole } from "../../../../../lib/auth/requireRole";
import { getClassroomForViewer } from "../../../../../repositories/classroomRepository";
import { listUpcomingSessions } from "../../../../../repositories/liveSessionRepository";
import { formatInZone, nextWeekendLocalDefault } from "../../../../../lib/time";
import { RosterForms } from "./RosterForms";
import { ScheduleSessionForm } from "./ScheduleSessionForm";
import { Card } from "../../../../../components/ui/Card";
import { EmptyState } from "../../../../../components/ui/EmptyState";
import {
  pageHeadingClass,
  sectionHeadingClass,
  textLinkClass,
} from "../../../../../components/ui/styles";

export default async function ClassroomDetailPage({
  params,
}: {
  params: { classroomId: string };
}) {
  const session = await getCurrentSession();
  // Membership-scoped: a classroom the viewer isn't in 404s rather than
  // rendering its roster to anyone who guesses the id.
  const classroom = await getClassroomForViewer(session, params.classroomId);
  if (!classroom) notFound();

  const canSchedule = (() => {
    try {
      requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
      return true;
    } catch {
      return false;
    }
  })();
  // Being in the room doesn't entitle you to everyone's contact details.
  // Staff see the roster; a classmate or another family sees the headcount.
  const canSeeRoster = canSchedule;
  const upcomingSessions = await listUpcomingSessions(session.tenantId, classroom.id);

  return (
    <div>
      <h1 className={pageHeadingClass}>{classroom.name}</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className={sectionHeadingClass}>Coaches</h2>
          {classroom.coaches.length === 0 ? (
            <p className="mt-2 text-sm text-slate">No coaches assigned yet.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-ink">
              {classroom.coaches.map((c) => (
                <li key={c.id}>{c.coach.user.email}</li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className={sectionHeadingClass}>Students</h2>
          {classroom.students.length === 0 ? (
            <p className="mt-2 text-sm text-slate">No students enrolled yet.</p>
          ) : canSeeRoster ? (
            <ul className="mt-2 space-y-1 text-sm text-ink">
              {classroom.students.map((s) => (
                <li key={s.id}>{s.student.user.email}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink">
              {classroom.students.length}{" "}
              {classroom.students.length === 1 ? "student" : "students"} enrolled.
            </p>
          )}
        </Card>
      </div>

      {session.role === "ACADEMY_ADMIN" && <RosterForms classroomId={classroom.id} />}

      <section className="mt-8">
        <h2 className={sectionHeadingClass}>Upcoming sessions</h2>

        {upcomingSessions.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No sessions scheduled yet"
              description={
                canSchedule
                  ? "Schedule the first live session below — students and parents will see it in their own time zone."
                  : "Check back once your coach schedules the next session."
              }
            />
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {upcomingSessions.map((liveSession) => (
              <Card key={liveSession.id} className="flex items-center justify-between p-4">
                <Link
                  href={`/dashboard/classrooms/${classroom.id}/sessions/${liveSession.id}`}
                  className={textLinkClass}
                >
                  {formatInZone(liveSession.scheduledAtUtc, session.timezone)}
                </Link>
                <span className="font-mono text-xs text-slate">
                  {liveSession.durationMins} min
                </span>
              </Card>
            ))}
          </ul>
        )}

        {canSchedule && (
          <Card className="mt-4">
            <ScheduleSessionForm
              classroomId={classroom.id}
              defaultLocalDateTime={
                classroom.weekendFirst
                  ? nextWeekendLocalDefault(session.timezone)
                  : ""
              }
            />
          </Card>
        )}
      </section>
    </div>
  );
}
