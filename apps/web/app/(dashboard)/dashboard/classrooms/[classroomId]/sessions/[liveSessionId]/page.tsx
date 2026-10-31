import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentSession } from "../../../../../../../lib/auth/session";
import { requireRole } from "../../../../../../../lib/auth/requireRole";
import { getLiveSessionForViewer } from "../../../../../../../repositories/liveSessionRepository";
import { formatInZone } from "../../../../../../../lib/time";
import {
  effectiveSessionStatus,
  sessionStatusLabel,
} from "../../../../../../../lib/liveSession";
import { canStartSession } from "../../../../../../../lib/liveSession";
import { effectiveMeetingUrl, meetingButtonLabel } from "../../../../../../../lib/meetingLink";
import { LiveBoard } from "../../../../../../../components/LiveBoard";
import { StartClassButton } from "../../../StartClassButton";
import { MeetingLinkForm } from "../../../MeetingLinkForm";
import { Card } from "../../../../../../../components/ui/Card";
import {
  pageHeadingClass,
  sectionHeadingClass,
  textLinkClass,
} from "../../../../../../../components/ui/styles";

export default async function LiveSessionPage({
  params,
}: {
  params: { classroomId: string; liveSessionId: string };
}) {
  const session = await getCurrentSession();
  // Membership-scoped: a session in a classroom the viewer isn't in 404s
  // instead of showing its time and duration to anyone in the academy.
  const liveSession = await getLiveSessionForViewer(session, params.liveSessionId);
  if (!liveSession || liveSession.classroomId !== params.classroomId) {
    notFound();
  }

  const status = effectiveSessionStatus(liveSession);

  const canMarkAttendance = (() => {
    try {
      requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
      return true;
    } catch {
      return false;
    }
  })();

  // Who the socket will actually admit to the shared board. `join-room` ends in
  // canAccessLiveSession (apps/api/src/socket/rooms.ts), which checks
  // isClassroomCoach for a COACH and isClassroomStudent for *every* other role
  // — so a PARENT, and an ACADEMY_ADMIN who has no StudentProfile, are both
  // refused. That refusal is correct: the shared room is a lesson, and its
  // audio sub-room is a live mic in it. What was wrong is that this page
  // rendered the board for them anyway and left them staring at "Could not
  // join session". Mirror the socket's rule here instead of widening it.
  const canJoinBoard = session.role === "COACH" || session.role === "STUDENT";

  const meetingUrl = effectiveMeetingUrl(liveSession, liveSession.classroom);
  // Once started, the button has done its job; startSessionAction re-checks
  // the coach's assignment, so showing it to any COACH here is only a hint.
  const showStart =
    session.role === "COACH" &&
    liveSession.startedAtUtc === null &&
    canStartSession(liveSession, { hasAttendance: liveSession._count.attendance > 0 });

  return (
    <div>
      <h1 className={pageHeadingClass}>
        {formatInZone(liveSession.scheduledAtUtc, session.timezone)}
      </h1>
      <p className="mt-1 font-mono text-sm text-slate">
        {/* The row is still reachable by URL after it drops out of the
            upcoming list, so the state has to be visible here — otherwise a
            cancelled class looks like a working one that nobody joins. */}
        {sessionStatusLabel(status)} · {liveSession.durationMins} minutes
        {canMarkAttendance && (
          <>
            {" · "}
            <Link
              href={`/dashboard/attendance/${liveSession.classroomId}/${liveSession.id}`}
              className={textLinkClass}
            >
              mark attendance
            </Link>
          </>
        )}
      </p>

      {(meetingUrl || showStart) && status !== "CANCELLED" && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {showStart && (
            <StartClassButton classroomId={liveSession.classroomId} liveSessionId={liveSession.id} />
          )}
          {meetingUrl && status !== "COMPLETED" && (
            <a
              href={meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-lg border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-ink/5"
            >
              {meetingButtonLabel(meetingUrl)}
            </a>
          )}
        </div>
      )}

      <div className="mt-6">
        {canJoinBoard ? (
          <LiveBoard
            liveSessionId={liveSession.id}
            role={session.role}
            timezone={session.timezone}
          />
        ) : (
          <Card>
            <h2 className={sectionHeadingClass}>
              {status === "CANCELLED" ? "This class was cancelled" : "Class details"}
            </h2>
            <p className="mt-2 text-sm text-slate">
              The shared board is part of the lesson itself — the coach and the
              enrolled students work on it together. You can see when this class
              runs, and attendance appears here once the coach marks it.
            </p>
          </Card>
        )}
      </div>

      {/* canMarkAttendance is the staff gate; setMeetingUrlAction re-checks the
          coach's assignment to this room. */}
      {canMarkAttendance && status !== "CANCELLED" && status !== "COMPLETED" && (
        <Card className="mt-6">
          <MeetingLinkForm
            classroomId={liveSession.classroomId}
            liveSessionId={liveSession.id}
            currentUrl={liveSession.meetingUrl}
          />
        </Card>
      )}
    </div>
  );
}
