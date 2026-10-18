import { getCurrentSession } from "../../../../lib/auth/session";
import { requireRole } from "../../../../lib/auth/requireRole";
import { formatInZone } from "../../../../lib/time";
import { displayName } from "../../../../lib/displayName";
import { getStudentProfileByUserId } from "../../../../repositories/userRepository";
import {
  listGamesForStudent,
  listRecentGamesForTenant,
} from "../../../../repositories/gameRepository";
import { RequestAnalysisButton } from "./RequestAnalysisButton";
import { Card } from "../../../../components/ui/Card";
import { Badge, type BadgeTone } from "../../../../components/ui/Badge";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { pageHeadingClass } from "../../../../components/ui/styles";

const SOURCE_LABEL: Record<string, string> = {
  PLATFORM: "Played here",
  LICHESS: "Lichess",
  CHESSCOM: "Chess.com",
};

const ANALYSIS_TONE: Record<string, BadgeTone> = {
  DONE: "success",
  RUNNING: "warn",
  QUEUED: "muted",
  FAILED: "danger",
};

type GameRow = {
  id: string;
  source: string;
  result: string;
  playedAtUtc: Date;
  analysis: { status: string; accuracy: number | null } | null;
};

function AnalysisCell({ analysis }: { analysis: GameRow["analysis"] }) {
  if (!analysis) return <span className="text-xs text-slate">Not analysed</span>;
  if (analysis.status === "DONE") {
    return (
      <Badge tone="success">
        {analysis.accuracy === null
          ? // Null accuracy means the PGN's names matched neither handle on
            // file, so the analysis couldn't say which side was the student's.
            "Analysed"
          : `${analysis.accuracy}% accuracy`}
      </Badge>
    );
  }
  return <Badge tone={ANALYSIS_TONE[analysis.status] ?? "neutral"}>{analysis.status}</Badge>;
}

export default async function GamesPage() {
  const session = await getCurrentSession();

  const canAnalyse = (() => {
    try {
      requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
      return true;
    } catch {
      return false;
    }
  })();

  if (!canAnalyse) {
    const profile = await getStudentProfileByUserId(session.tenantId, session.id);
    const games = profile ? await listGamesForStudent(session.tenantId, profile.id) : [];

    return (
      <div>
        <h1 className={pageHeadingClass}>My games</h1>
        <p className="mt-1 text-sm text-slate">
          Link your Lichess or Chess.com account on your profile to import games automatically.
        </p>
        {games.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="No games yet"
              description="Once your accounts are linked, games you play there appear here overnight."
            />
          </div>
        ) : (
          <ul className="mt-6 space-y-2">
            {games.map((game) => (
              <Card key={game.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-mono text-sm text-ink">{game.result}</p>
                  <p className="text-xs text-slate">
                    {SOURCE_LABEL[game.source] ?? game.source} ·{" "}
                    {formatInZone(game.playedAtUtc, session.timezone)}
                  </p>
                </div>
                <AnalysisCell analysis={game.analysis} />
              </Card>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const games = await listRecentGamesForTenant(session.tenantId);

  return (
    <div>
      <h1 className={pageHeadingClass}>Games</h1>
      <p className="mt-1 text-sm text-slate">
        Imported overnight from each student&rsquo;s linked Lichess and Chess.com accounts.
        Analysis runs on the server and takes a few minutes per game.
      </p>

      {games.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No games imported yet"
            description="Students link their Lichess or Chess.com account on their own profile page; the nightly sync picks it up from there."
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {games.map((game) => (
            <Card key={game.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm text-ink">{displayName(game.student.user)}</p>
                <p className="text-xs text-slate">
                  <span className="font-mono">{game.result}</span> ·{" "}
                  {SOURCE_LABEL[game.source] ?? game.source} ·{" "}
                  {formatInZone(game.playedAtUtc, session.timezone)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <AnalysisCell analysis={game.analysis} />
                {game.analysis?.status !== "RUNNING" && (
                  <RequestAnalysisButton gameId={game.id} />
                )}
              </div>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
