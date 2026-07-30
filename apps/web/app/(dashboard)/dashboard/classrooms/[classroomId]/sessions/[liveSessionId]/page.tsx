import { notFound } from "next/navigation";
import { getCurrentSession } from "../../../../../../../lib/auth/session";
import { getLiveSession } from "../../../../../../../repositories/liveSessionRepository";
import { formatInZone } from "../../../../../../../lib/time";
import { LiveBoard } from "../../../../../../../components/LiveBoard";

export default async function LiveSessionPage({
  params,
}: {
  params: { classroomId: string; liveSessionId: string };
}) {
  const session = await getCurrentSession();
  const liveSession = await getLiveSession(session.tenantId, params.liveSessionId);
  if (!liveSession || liveSession.classroomId !== params.classroomId) {
    notFound();
  }

  return (
    <div>
      <h1 className="text-lg font-semibold">
        {formatInZone(liveSession.scheduledAtUtc, session.timezone)}
      </h1>
      <p className="mt-1 text-sm text-gray-500">{liveSession.durationMins} minutes</p>
      <div className="mt-6">
        <LiveBoard liveSessionId={liveSession.id} role={session.role} />
      </div>
    </div>
  );
}
