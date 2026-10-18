import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentSession } from "../../../../../lib/auth/session";
import { requireRole } from "../../../../../lib/auth/requireRole";
import { formatInZone } from "../../../../../lib/time";
import { displayName } from "../../../../../lib/displayName";
import { getTournament } from "../../../../../repositories/tournamentRepository";
import { listParentsAndStudents } from "../../../../../repositories/userRepository";
import { GenerateRoundButton, RegisterPlayerForm, ResultPicker } from "../TournamentForms";
import { LiveTournament } from "../LiveTournament";
import { Card } from "../../../../../components/ui/Card";
import { Badge } from "../../../../../components/ui/Badge";
import { EmptyState } from "../../../../../components/ui/EmptyState";
import {
  pageHeadingClass,
  sectionHeadingClass,
  tableWrapperClass,
  tbodyRowClass,
  tdClass,
  thClass,
  theadRowClass,
  textLinkClass,
} from "../../../../../components/ui/styles";

export default async function TournamentDetailPage({
  params,
}: {
  params: { tournamentId: string };
}) {
  const session = await getCurrentSession();
  const tournament = await getTournament(session.tenantId, params.tournamentId);
  if (!tournament) notFound();

  const canOrganise = (() => {
    try {
      requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
      return true;
    } catch {
      return false;
    }
  })();

  // Participants carry a StudentProfile id; the roster resolves it to a name.
  const { students } = await listParentsAndStudents(session.tenantId);
  const nameByStudentId = new Map(students.map((s) => [s.id, displayName(s.user)]));
  const nameByParticipantId = new Map(
    tournament.participants.map((p) => [p.id, nameByStudentId.get(p.studentId) ?? "Unknown player"])
  );

  const rounds = [...new Set(tournament.pairings.map((p) => p.round))].sort((a, b) => b - a);
  const entered = new Set(tournament.participants.map((p) => p.studentId));
  const available = students
    .filter((s) => !entered.has(s.id))
    .map((s) => ({ id: s.id, label: displayName(s.user) }));

  return (
    <div>
      <Link href="/dashboard/tournaments" className={`${textLinkClass} text-sm`}>
        ← All tournaments
      </Link>
      <h1 className={`${pageHeadingClass} mt-2`}>{tournament.name}</h1>
      <p className="mt-1 text-sm text-slate">
        <Badge>{tournament.format === "SWISS" ? "Swiss" : "Arena"}</Badge>{" "}
        <span className="ml-2">
          {formatInZone(tournament.startsAtUtc, session.timezone)} ·{" "}
          {tournament.participants.length} players
        </span>
      </p>

      {/* Subscribes to this tournament's room and re-renders this page when a
          round is paired or a result recorded. Open to every viewer, not just
          the organiser — spectating is the point (claude.md §5). */}
      <div className="mt-3">
        <LiveTournament tournamentId={tournament.id} />
      </div>

      <section className="mt-8">
        <h2 className={sectionHeadingClass}>Standings</h2>
        {tournament.participants.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No players entered yet"
              description={
                canOrganise
                  ? "Enter players below, then pair the first round."
                  : "Players will appear here once the organiser enters them."
              }
            />
          </div>
        ) : (
          <div className={tableWrapperClass}>
            <table className="w-full text-sm">
              <thead>
                <tr className={theadRowClass}>
                  <th className={thClass}>#</th>
                  <th className={thClass}>Player</th>
                  <th className={thClass}>Score</th>
                </tr>
              </thead>
              <tbody>
                {tournament.participants.map((participant, index) => (
                  <tr key={participant.id} className={tbodyRowClass}>
                    <td className={tdClass}>{index + 1}</td>
                    <td className={tdClass}>{nameByParticipantId.get(participant.id)}</td>
                    <td className={`${tdClass} font-mono`}>{participant.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canOrganise && (
        <section className="mt-8">
          <h2 className={sectionHeadingClass}>Organiser</h2>
          <Card className="mt-3 space-y-4">
            {available.length > 0 ? (
              <RegisterPlayerForm tournamentId={tournament.id} students={available} />
            ) : (
              <p className="text-sm text-slate">Every student in the academy is entered.</p>
            )}
            <GenerateRoundButton tournamentId={tournament.id} />
          </Card>
        </section>
      )}

      <section className="mt-8">
        <h2 className={sectionHeadingClass}>Pairings</h2>
        {rounds.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No rounds paired yet"
              description={
                canOrganise
                  ? "Pair the first round once at least two players are entered."
                  : "Pairings appear here as each round starts."
              }
            />
          </div>
        ) : (
          rounds.map((round) => (
            <div key={round} className="mt-4">
              <h3 className="text-sm font-medium text-ink">Round {round}</h3>
              <ul className="mt-2 space-y-2">
                {tournament.pairings
                  .filter((p) => p.round === round)
                  .map((pairing) => (
                    <Card
                      key={pairing.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4"
                    >
                      <span className="text-sm text-ink">
                        {nameByParticipantId.get(pairing.whiteId)}
                        {pairing.blackId ? (
                          <>
                            {" vs "}
                            {nameByParticipantId.get(pairing.blackId)}
                          </>
                        ) : (
                          <span className="text-slate"> — bye</span>
                        )}
                      </span>
                      {pairing.blackId === null ? (
                        <Badge tone="muted">Bye</Badge>
                      ) : canOrganise ? (
                        <ResultPicker
                          tournamentId={tournament.id}
                          pairingId={pairing.id}
                          current={pairing.result}
                        />
                      ) : (
                        <span className="font-mono text-xs text-slate">
                          {pairing.result ?? "in progress"}
                        </span>
                      )}
                    </Card>
                  ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
