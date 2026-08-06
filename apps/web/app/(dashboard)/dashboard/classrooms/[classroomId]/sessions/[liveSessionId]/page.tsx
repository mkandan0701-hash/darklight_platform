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
import { LiveBoard } from "../../../../../../../components/LiveBoard";
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
    </div>
  );
}
