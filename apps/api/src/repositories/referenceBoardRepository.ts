import { prisma } from "@chessplay-clone/db";

// The coach's prep board is durable: Redis is the hot path during a lesson,
// but this is what survives a restart and lets a coach set a position up the
// night before. Callers must hold ambient tenant context (runWithTenant).

export async function findReferenceBoardFen(
  tenantId: string,
  liveSessionId: string
): Promise<string | null> {
  const board = await prisma.referenceBoard.findFirst({
    where: { tenantId, liveSessionId },
    select: { fen: true },
  });
  return board?.fen ?? null;
}

// One reference board per live session (ReferenceBoard.liveSessionId is
// @unique), so this is an upsert rather than a create. coachId is a
// CoachProfile.id — resolve it with findCoachProfileId, not a User id.
export async function upsertReferenceBoardFen(params: {
  tenantId: string;
  liveSessionId: string;
  coachId: string;
  fen: string;
}): Promise<void> {
  const { tenantId, liveSessionId, coachId, fen } = params;
  await prisma.referenceBoard.upsert({
    where: { liveSessionId },
    create: { tenantId, liveSessionId, coachId, fen },
    // coachId is intentionally left alone on update: it records who set the
    // board up, and a second coach editing it shouldn't rewrite that.
    update: { fen },
  });
}
