import { getCurrentSession } from "../../../../lib/auth/session";
import { requireRoleOrNotFound } from "../../../../lib/auth/requireRole";
import { listUploadedPuzzles } from "../../../../repositories/puzzleRepository";
import { PuzzleUploadForm } from "./PuzzleUploadForm";
import { EmptyState } from "../../../../components/ui/EmptyState";
import {
  pageHeadingClass,
  tableWrapperClass,
  tbodyRowClass,
  tdClass,
  thClass,
  theadRowClass,
} from "../../../../components/ui/styles";

export default async function PuzzlesPage() {
  const session = await getCurrentSession();
  requireRoleOrNotFound(session, ["ACADEMY_ADMIN", "COACH"]);

  const puzzles = await listUploadedPuzzles(session.tenantId);

  return (
    <div>
      <h1 className={pageHeadingClass}>Puzzle library</h1>
      <div className="mt-4">
        <PuzzleUploadForm />
      </div>

      <h2 className="mt-8 text-sm font-medium text-slate">
        Your academy&apos;s uploaded puzzles ({puzzles.length})
      </h2>

      {puzzles.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title="No puzzles uploaded yet"
            description="Upload a PGN file above to start building your academy's own puzzle set."
          />
        </div>
      ) : (
        <div className={tableWrapperClass}>
          <table className="w-full text-sm">
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>Starting position (FEN)</th>
                <th className={thClass}>Solution length</th>
                <th className={thClass}>Added</th>
              </tr>
            </thead>
            <tbody>
              {puzzles.map((puzzle) => (
                <tr key={puzzle.id} className={tbodyRowClass}>
                  <td className={`${tdClass} font-mono text-xs`}>{puzzle.fen}</td>
                  <td className={tdClass}>{puzzle.moves.split(" ").length} moves</td>
                  <td className={tdClass}>{puzzle.createdAt.toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
