import { prisma } from "@chessplay-clone/db";

// Called inside runWithTenant, so tenantScope verifies these filters rather
// than merely finding a tenantId present.

export async function findGameForAnalysis(tenantId: string, gameId: string) {
  return prisma.game.findFirst({
    where: { id: gameId, tenantId },
    select: {
      id: true,
      pgn: true,
      studentId: true,
      student: { select: { lichessHandle: true, chesscomHandle: true } },
    },
  });
}

/**
 * Claims the analysis row for this run.
 *
 * Upsert-shaped via find-then-write rather than prisma.upsert: GameAnalysis's
 * unique key is `gameId` alone, so an upsert's where carries no tenantId and
 * tenantScope refuses it — the same failure mode documented on markAttendance.
 */
export async function startAnalysis(tenantId: string, gameId: string, engineDepth: number) {
  const existing = await prisma.gameAnalysis.findFirst({
    where: { gameId, tenantId },
    select: { id: true },
  });

  if (existing) {
    await prisma.gameAnalysis.updateMany({
      where: { id: existing.id, tenantId },
      data: { status: "RUNNING", engineDepth, completedAtUtc: null },
    });
    return existing.id;
  }

  const created = await prisma.gameAnalysis.create({
    data: { tenantId, gameId, engineDepth, status: "RUNNING", blunders: [] },
  });
  return created.id;
}

export async function completeAnalysis(
  tenantId: string,
  analysisId: string,
  input: { accuracy: number | null; blunders: unknown }
) {
  await prisma.gameAnalysis.updateMany({
    where: { id: analysisId, tenantId },
    data: {
      status: "DONE",
      accuracy: input.accuracy,
      blunders: input.blunders as never,
      completedAtUtc: new Date(),
    },
  });
}

// Separate from completeAnalysis so a failed run leaves a row saying so,
// rather than one stuck on RUNNING forever with no way to tell a crashed job
// from a slow one.
export async function failAnalysis(tenantId: string, analysisId: string) {
  await prisma.gameAnalysis.updateMany({
    where: { id: analysisId, tenantId },
    data: { status: "FAILED", completedAtUtc: new Date() },
  });
}
