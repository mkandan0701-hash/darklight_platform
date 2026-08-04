import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentSession } from "../../../../../../../lib/auth/session";
import { requireRole } from "../../../../../../../lib/auth/requireRole";
import { getLiveSessionForViewer } from "../../../../../../../repositories/liveSessionRepository";
import { formatInZone } from "../../../../../../../lib/time";
import { LiveBoard } from "../../../../../../../components/LiveBoard";
import { pageHeadingClass, textLinkClass } from "../../../../../../../components/ui/styles";

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

  const canMarkAttendance = (() => {
    try {
      requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
      return true;
    } catch {
      return false;
    }
  })();

  return (
    <div>
      <h1 className={pageHeadingClass}>
        {formatInZone(liveSession.scheduledAtUtc, session.timezone)}
      </h1>
      <p className="mt-1 font-mono text-sm text-slate">
        {liveSession.durationMins} minutes
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
        <LiveBoard
          liveSessionId={liveSession.id}
          role={session.role}
          timezone={session.timezone}
        />
      </div>
    </div>
  );
}
