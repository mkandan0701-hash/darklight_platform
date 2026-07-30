import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentSession } from "../../../../../lib/auth/session";
import { requireRole } from "../../../../../lib/auth/requireRole";
import { getClassroom } from "../../../../../repositories/classroomRepository";
import { listUpcomingSessions } from "../../../../../repositories/liveSessionRepository";
import { formatInZone, nextWeekendLocalDefault } from "../../../../../lib/time";
import { RosterForms } from "./RosterForms";
import { ScheduleSessionForm } from "./ScheduleSessionForm";

export default async function ClassroomDetailPage({
  params,
}: {
  params: { classroomId: string };
}) {
  const session = await getCurrentSession();
  const classroom = await getClassroom(session.tenantId, params.classroomId);
  if (!classroom) notFound();

  const canSchedule = (() => {
    try {
      requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
      return true;
    } catch {
      return false;
    }
  })();
  const upcomingSessions = await listUpcomingSessions(session.tenantId, classroom.id);

  return (
    <div>
      <h1 className="text-lg font-semibold">{classroom.name}</h1>

      <section className="mt-6">
        <h2 className="font-medium">Coaches</h2>
        <ul className="mt-2 text-sm">
          {classroom.coaches.map((c) => (
            <li key={c.id}>{c.coach.user.email}</li>
          ))}
          {classroom.coaches.length === 0 && (
            <p className="text-gray-500">No coaches assigned yet.</p>
          )}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="font-medium">Students</h2>
        <ul className="mt-2 text-sm">
          {classroom.students.map((s) => (
            <li key={s.id}>{s.student.user.email}</li>
          ))}
          {classroom.students.length === 0 && (
            <p className="text-gray-500">No students enrolled yet.</p>
          )}
        </ul>
      </section>

      {session.role === "ACADEMY_ADMIN" && (
        <RosterForms classroomId={classroom.id} />
      )}

      <section className="mt-8">
        <h2 className="font-medium">Upcoming sessions</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {upcomingSessions.map((liveSession) => (
            <li key={liveSession.id}>
              <Link
                href={`/dashboard/classrooms/${classroom.id}/sessions/${liveSession.id}`}
                className="text-blue-600 hover:underline"
              >
                {formatInZone(liveSession.scheduledAtUtc, session.timezone)}
              </Link>
              <span className="ml-2 text-xs text-gray-500">
                {liveSession.durationMins} min
              </span>
            </li>
          ))}
          {upcomingSessions.length === 0 && (
            <p className="text-gray-500">No sessions scheduled yet.</p>
          )}
        </ul>
        {canSchedule && (
          <div className="mt-4">
            <ScheduleSessionForm
              classroomId={classroom.id}
              defaultLocalDateTime={
                classroom.weekendFirst
                  ? nextWeekendLocalDefault(session.timezone)
                  : ""
              }
            />
          </div>
        )}
      </section>
    </div>
  );
}
