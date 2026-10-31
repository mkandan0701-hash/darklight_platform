import { randomUUID } from "node:crypto";
import { prisma, type TournamentFormat } from "@chessplay-clone/db";
import { TenantMismatchError } from "../lib/auth/errors";

export async function createTournament(input: {
  tenantId: string;
  name: string;
  format: TournamentFormat;
  startsAtUtc: Date;
}) {
  return prisma.tournament.create({
    data: { ...input, socketRoomId: randomUUID() },
  });
}

export async function listTournaments(tenantId: string) {
  return prisma.tournament.findMany({
    where: { tenantId },
    include: { participants: true, pairings: true },
    orderBy: { startsAtUtc: "desc" },
  });
}

export async function getTournament(tenantId: string, tournamentId: string) {
  return prisma.tournament.findFirst({
    where: { id: tournamentId, tenantId },
    include: {
      participants: { orderBy: { score: "desc" } },
      pairings: { orderBy: { round: "asc" } },
    },
  });
}

/** Idempotent: registering an already-entered student is a no-op, not an error. */
export async function registerParticipant(
  tenantId: string,
  tournamentId: string,
  studentId: string
) {
  // Both ids come off a form. The row being written carries the caller's own
  // tenantId, so tenantScope is satisfied whoever these actually belong to —
  // only this check stops another academy's student entering the draw.
  const [tournament, student] = await Promise.all([
    prisma.tournament.findFirst({ where: { id: tournamentId, tenantId }, select: { id: true } }),
    prisma.studentProfile.findFirst({ where: { id: studentId, tenantId }, select: { id: true } }),
  ]);
  if (!tournament || !student) {
    throw new TenantMismatchError("Tournament or student does not belong to this academy");
  }

  const existing = await prisma.tournamentParticipant.findFirst({
    where: { tenantId, tournamentId, studentId },
  });
  if (existing) return existing;

  return prisma.tournamentParticipant.create({
    data: { tenantId, tournamentId, studentId },
  });
}

export async function createPairings(
  tenantId: string,
  tournamentId: string,
  round: number,
  pairings: { whiteId: string; blackId: string | null; result?: string | null }[]
) {
  if (pairings.length === 0) return { count: 0 };
  return prisma.tournamentPairing.createMany({
    data: pairings.map((p) => ({
      tenantId,
      tournamentId,
      round,
      whiteId: p.whiteId,
      blackId: p.blackId,
      result: p.result ?? null,
    })),
  });
}

export async function getPairing(tenantId: string, pairingId: string) {
  return prisma.tournamentPairing.findFirst({ where: { id: pairingId, tenantId } });
}

/**
 * Records a result and moves the points.
 *
 * One transaction because a recorded result and the standings it produces
 * must not be able to disagree: a crash between the two would leave a game
 * marked finished whose points never landed, and nothing would ever notice.
 *
 * Re-recording is supported (a coach fixing a typo), so the previous result's
 * points are backed out first rather than added to.
 */
export async function recordPairingResult(
  tenantId: string,
  pairingId: string,
  result: string,
  delta: { white: number; black: number },
  previous: { white: number; black: number }
) {
  return prisma.$transaction(async (tx) => {
    const pairing = await tx.tournamentPairing.findFirst({
      where: { id: pairingId, tenantId },
    });
    if (!pairing) throw new TenantMismatchError("Pairing does not belong to this academy");

    await tx.tournamentPairing.updateMany({
      where: { id: pairingId, tenantId },
      data: { result },
    });

    const adjust = async (participantId: string | null, points: number) => {
      if (!participantId || points === 0) return;
      await tx.tournamentParticipant.updateMany({
        where: { id: participantId, tenantId },
        data: { score: { increment: points } },
      });
    };

    await adjust(pairing.whiteId, delta.white - previous.white);
    await adjust(pairing.blackId, delta.black - previous.black);

    return pairing;
  });
}
