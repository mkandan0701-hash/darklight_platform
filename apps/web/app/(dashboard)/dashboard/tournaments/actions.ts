"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "../../../../lib/auth/session";
import { requireRole } from "../../../../lib/auth/requireRole";
import { TenantMismatchError } from "../../../../lib/auth/errors";
import { zonedLocalToUtc } from "../../../../lib/time";
import {
  BYE_RESULT,
  pairRound,
  scoreForResult,
  type PairingPlayer,
} from "../../../../lib/tournaments/pairings";
import {
  createPairings,
  createTournament,
  getPairing,
  getTournament,
  recordPairingResult,
  registerParticipant,
} from "../../../../repositories/tournamentRepository";
import { publishTournamentEventSafely } from "../../../../lib/queues/tournamentEventsQueue";

type ActionResult = { ok: true } | { ok: false; error: string };

const CreateTournamentSchema = z.object({
  name: z.string().min(2, "Tournament name is required").max(120),
  format: z.enum(["SWISS", "ARENA"]),
  startsLocal: z.string().min(1, "Pick a start time"),
});

export async function createTournamentAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
  } catch {
    return { ok: false, error: "Only admins or coaches can run tournaments" };
  }

  const parsed = CreateTournamentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Entered in the organiser's own timezone, stored UTC — every entrant reads
  // the start time on their own clock (claude.md §3.5).
  let startsAtUtc: Date;
  try {
    startsAtUtc = zonedLocalToUtc(parsed.data.startsLocal, session.timezone);
  } catch {
    return { ok: false, error: "Invalid start time" };
  }

  await createTournament({
    tenantId: session.tenantId,
    name: parsed.data.name,
    format: parsed.data.format,
    startsAtUtc,
  });
  revalidatePath("/dashboard/tournaments");
  return { ok: true };
}

const RegisterSchema = z.object({
  tournamentId: z.string().min(1),
  studentId: z.string().min(1),
});

export async function registerParticipantAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
  } catch {
    return { ok: false, error: "Only admins or coaches can enter players" };
  }

  const parsed = RegisterSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await registerParticipant(session.tenantId, parsed.data.tournamentId, parsed.data.studentId);
  } catch (err) {
    if (err instanceof TenantMismatchError) {
      return { ok: false, error: "That student or tournament isn't part of your academy" };
    }
    throw err;
  }

  revalidatePath(`/dashboard/tournaments/${parsed.data.tournamentId}`);
  return { ok: true };
}

const GenerateRoundSchema = z.object({ tournamentId: z.string().min(1) });

/**
 * Pairs the next round from the current standings.
 *
 * Refuses while any game in the latest round is unfinished: pairing off
 * half-final standings seats people against the wrong opponents, and there is
 * no clean way to withdraw a round everyone can already see.
 */
export async function generateRoundAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
  } catch {
    return { ok: false, error: "Only admins or coaches can pair a round" };
  }

  const parsed = GenerateRoundSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const tournament = await getTournament(session.tenantId, parsed.data.tournamentId);
  if (!tournament) return { ok: false, error: "Tournament not found" };
  if (tournament.participants.length < 2) {
    return { ok: false, error: "At least two players are needed to pair a round" };
  }

  const lastRound = tournament.pairings.reduce((max, p) => Math.max(max, p.round), 0);
  const unfinished = tournament.pairings.some((p) => p.round === lastRound && !p.result);
  if (unfinished) {
    return { ok: false, error: "Finish the current round before pairing the next one" };
  }

  // The history the pairing rules need, rebuilt from the rounds already played.
  const players: PairingPlayer[] = tournament.participants.map((participant) => {
    const opponents: string[] = [];
    const colors: ("w" | "b")[] = [];
    let hadBye = false;

    for (const pairing of tournament.pairings) {
      if (pairing.whiteId === participant.id) {
        colors.push("w");
        if (pairing.blackId) opponents.push(pairing.blackId);
        else hadBye = true;
      } else if (pairing.blackId === participant.id) {
        colors.push("b");
        opponents.push(pairing.whiteId);
      }
    }

    return { id: participant.id, score: participant.score, opponents, colors, hadBye };
  });

  const pairings = pairRound(tournament.format, players);
  if (pairings.length === 0) {
    return { ok: false, error: "No pairings could be made for this round" };
  }

  const round = lastRound + 1;
  // A bye is scored as it is created: there is no game to report later, and
  // leaving it resultless would block the next round forever.
  await createPairings(
    session.tenantId,
    tournament.id,
    round,
    pairings.map((p) => ({ ...p, result: p.blackId === null ? BYE_RESULT : null }))
  );

  await applyByePoints(session.tenantId, tournament.id, round);

  revalidatePath(`/dashboard/tournaments/${tournament.id}`);
  // The list page shows each tournament’s round count, and these two actions
  // are the only things that move it.
  revalidatePath("/dashboard/tournaments");

  // Nudges everyone watching to refetch. Never awaited for its success: the
  // round is already committed, so a Redis outage must not report back as a
  // round that failed to pair.
  await publishTournamentEventSafely({
    tenantId: session.tenantId,
    tournamentId: tournament.id,
    kind: "round-published",
    round,
  });
  return { ok: true };
}

/**
 * Credits the bye's full point.
 *
 * Routed through recordPairingResult like any played game, so standings have
 * exactly one way of moving — a second path that incremented scores directly
 * is how a bye ends up worth two points after a re-record.
 */
async function applyByePoints(tenantId: string, tournamentId: string, round: number) {
  const tournament = await getTournament(tenantId, tournamentId);
  const byes =
    tournament?.pairings.filter((p) => p.round === round && p.blackId === null) ?? [];

  for (const bye of byes) {
    await recordPairingResult(tenantId, bye.id, BYE_RESULT, scoreForResult(BYE_RESULT), {
      white: 0,
      black: 0,
    });
  }
}

const RecordResultSchema = z.object({
  tournamentId: z.string().min(1),
  pairingId: z.string().min(1),
  result: z.enum(["1-0", "0-1", "1/2-1/2"]),
});

export async function recordResultAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
  } catch {
    return { ok: false, error: "Only admins or coaches can record results" };
  }

  const parsed = RecordResultSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Holding rights to this tournament must not make another one's pairing
  // editable by supplying its id — the same nested-route check
  // cancelSessionAction makes.
  const pairing = await getPairing(session.tenantId, parsed.data.pairingId);
  if (!pairing || pairing.tournamentId !== parsed.data.tournamentId) {
    return { ok: false, error: "Pairing not found in this tournament" };
  }

  try {
    await recordPairingResult(
      session.tenantId,
      pairing.id,
      parsed.data.result,
      scoreForResult(parsed.data.result),
      // Backing out whatever was recorded before is what makes correcting a
      // typo safe instead of double-counting the points.
      scoreForResult(pairing.result ?? "")
    );
  } catch (err) {
    if (err instanceof TenantMismatchError) {
      return { ok: false, error: "That pairing isn't part of your academy" };
    }
    throw err;
  }

  revalidatePath(`/dashboard/tournaments/${parsed.data.tournamentId}`);
  revalidatePath("/dashboard/tournaments");

  await publishTournamentEventSafely({
    tenantId: session.tenantId,
    tournamentId: parsed.data.tournamentId,
    kind: "result-recorded",
    round: pairing.round,
  });
  return { ok: true };
}
