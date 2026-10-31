import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentSession } from "../../../../../lib/auth/session";
import { requireRole } from "../../../../../lib/auth/requireRole";
import { getClassroomForViewer } from "../../../../../repositories/classroomRepository";
import { listUpcomingSessions } from "../../../../../repositories/liveSessionRepository";
import { listActiveScheduleSlotsForClassroom } from "../../../../../repositories/scheduleSlotRepository";
import { getClassroomLeaderboard } from "../../../../../repositories/gamificationRepository";
import { displayName } from "../../../../../lib/displayName";
import { formatInZone, nextWeekendLocalDefault } from "../../../../../lib/time";
import { effectiveSessionStatus, sessionStatusLabel } from "../../../../../lib/liveSession";
import { CancelSessionButton } from "./CancelSessionButton";
import { RosterForms } from "./RosterForms";
import { ScheduleSessionForm } from "./ScheduleSessionForm";
import { ScheduleSlotForm } from "./ScheduleSlotForm";
import { RemoveScheduleSlotButton } from "./RemoveScheduleSlotButton";
import { MeetingLinkForm } from "../MeetingLinkForm";
import { Card } from "../../../../../components/ui/Card";
import { EmptyState } from "../../../../../components/ui/EmptyState";
import { Badge } from "../../../../../components/ui/Badge";
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
  const scheduleSlots = await listActiveScheduleSlotsForClassroom(session.tenantId, classroom.id);
  const leaderboard = await getClassroomLeaderboard(session.tenantId, classroom.id);
  const DAY_LABELS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

      {canSchedule && (
        <section className="mt-8">
          <h2 className={sectionHeadingClass}>Meeting link</h2>
          <Card className="mt-3">
            <MeetingLinkForm classroomId={classroom.id} currentUrl={classroom.meetingUrl} />
          </Card>
        </section>
      )}

      {canSchedule && (
        <section className="mt-8">
          <h2 className={sectionHeadingClass}>Weekly schedule</h2>

          {scheduleSlots.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                title="No weekly slots yet"
                description="Add a recurring time below — upcoming classes are generated automatically, so you don't have to schedule each one by hand."
              />
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {scheduleSlots.map((slot) => (
                <Card key={slot.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <span className="text-sm text-ink">
                    {DAY_LABELS[slot.dayOfWeek]} {slot.localTime} {slot.timezone}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-slate">{slot.durationMins} min</span>
                    <RemoveScheduleSlotButton classroomId={classroom.id} scheduleSlotId={slot.id} />
                  </div>
                </Card>
              ))}
            </ul>
          )}

          <Card className="mt-4">
            <ScheduleSlotForm
              classroomId={classroom.id}
              timezone={session.timezone}
              weekendFirst={classroom.weekendFirst}
              hasExistingSlots={scheduleSlots.length > 0}
            />
          </Card>
        </section>
      )}

      {leaderboard.length > 0 && (
        <section className="mt-8">
          <h2 className={sectionHeadingClass}>Leaderboard</h2>
          <p className="mt-1 text-xs text-slate">
            XP from solving puzzles and turning up — counted within this classroom only.
          </p>
          <ul className="mt-3 space-y-2">
            {leaderboard.map((row, index) => (
              <Card key={row.studentId} className="flex items-center justify-between gap-3 p-4">
                <span className="text-sm text-ink">
                  <span className="font-mono text-slate">{index + 1}.</span>{" "}
                  {displayName(row.user)}
                </span>
                <span className="font-mono text-xs text-slate">{row.xp} XP</span>
              </Card>
            ))}
          </ul>
        </section>
      )}

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
            {upcomingSessions.map((liveSession) => {
              const status = effectiveSessionStatus(liveSession);
              return (
                <Card key={liveSession.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <Link
                    href={`/dashboard/classrooms/${classroom.id}/sessions/${liveSession.id}`}
                    className={textLinkClass}
                  >
                    {formatInZone(liveSession.scheduledAtUtc, session.timezone)}
                  </Link>
                  <div className="flex items-center gap-3">
                    {status === "LIVE" && (
                      <Badge tone="solid">{sessionStatusLabel(status)}</Badge>
                    )}
                    <span className="font-mono text-xs text-slate">
                      {liveSession.durationMins} min
                    </span>
                    {canSchedule && (
                      <CancelSessionButton
                        classroomId={classroom.id}
                        liveSessionId={liveSession.id}
                      />
                    )}
                  </div>
                </Card>
              );
            })}
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
