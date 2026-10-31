import Link from "next/link";
import { getCurrentSession } from "../../../../lib/auth/session";
import { requireRole } from "../../../../lib/auth/requireRole";
import { formatInZone, nextWeekendLocalDefault } from "../../../../lib/time";
import { listTournaments } from "../../../../repositories/tournamentRepository";
import { CreateTournamentForm } from "./TournamentForms";
import { Card } from "../../../../components/ui/Card";
import { Badge } from "../../../../components/ui/Badge";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { pageHeadingClass, textLinkClass } from "../../../../components/ui/styles";

export default async function TournamentsPage() {
  const session = await getCurrentSession();

  const canOrganise = (() => {
    try {
      requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
      return true;
    } catch {
      return false;
    }
  })();

  const tournaments = await listTournaments(session.tenantId);

  return (
    <div>
      <h1 className={pageHeadingClass}>Tournaments</h1>
      <p className="mt-1 text-sm text-slate">
        Start times are shown in your own timezone ({session.timezone}).
      </p>

      {canOrganise && (
        <Card className="mt-4">
          <CreateTournamentForm defaultStart={nextWeekendLocalDefault(session.timezone)} />
        </Card>
      )}

      {tournaments.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No tournaments yet"
            description={
              canOrganise
                ? "Create one above — Swiss pairs by score each round, Arena pairs whoever is free."
                : "Your academy hasn't scheduled a tournament yet."
            }
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {tournaments.map((tournament) => {
            const rounds = tournament.pairings.reduce((max, p) => Math.max(max, p.round), 0);
            return (
              <Card
                key={tournament.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div>
                  <Link
                    href={`/dashboard/tournaments/${tournament.id}`}
                    className={textLinkClass}
                  >
                    {tournament.name}
                  </Link>
                  <p className="text-xs text-slate">
                    {formatInZone(tournament.startsAtUtc, session.timezone)} ·{" "}
                    {tournament.participants.length} players ·{" "}
                    {rounds === 0 ? "not started" : `round ${rounds}`}
                  </p>
                </div>
                <Badge>{tournament.format === "SWISS" ? "Swiss" : "Arena"}</Badge>
              </Card>
            );
          })}
        </ul>
      )}
    </div>
  );
}
