import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentSession } from "../../../../../../lib/auth/session";
import { formatInZone } from "../../../../../../lib/time";
import { getSimulBoard } from "../../../../../../repositories/simulRepository";
import { SimulBoard } from "../../../../../../components/SimulBoard";
import { pageHeadingClass, textLinkClass } from "../../../../../../components/ui/styles";

export default async function SimulBoardPage({
  params,
}: {
  params: { simulBoardId: string };
}) {
  const session = await getCurrentSession();

  // Tenant scoping only — who may actually sit at this board is decided by the
  // socket server on join (apps/api/src/socket/simulRooms.ts), which is the
  // layer that can also stop a move. Rendering the page for someone who then
  // cannot join is deliberate: the board simply reports it could not join,
  // exactly as the live-session page does.
  const board = await getSimulBoard(session.tenantId, params.simulBoardId);
  if (!board) notFound();

  return (
    <div>
      <Link href="/dashboard/simuls" className={`${textLinkClass} text-sm`}>
        ← All simuls
      </Link>
      <h1 className={`${pageHeadingClass} mt-2`}>Simul board {board.boardIdx}</h1>
      <p className="mt-1 text-sm text-slate">
        {formatInZone(board.simul.startsAtUtc, session.timezone)}
      </p>

      <div className="mt-6">
        <SimulBoard simulBoardId={board.id} />
      </div>
    </div>
  );
}
