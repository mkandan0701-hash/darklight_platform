import { prisma } from "@chessplay-clone/db";

const WITH_ANALYSIS = {
  analysis: {
    select: {
      status: true,
      accuracy: true,
      engineDepth: true,
      blunders: true,
      completedAtUtc: true,
    },
  },
} as const;

export async function listGamesForStudent(tenantId: string, studentId: string, take = 50) {
  return prisma.game.findMany({
    where: { tenantId, studentId },
    include: WITH_ANALYSIS,
    orderBy: { playedAtUtc: "desc" },
    take,
  });
}

export async function listRecentGamesForTenant(tenantId: string, take = 50) {
  return prisma.game.findMany({
    where: { tenantId },
    include: { ...WITH_ANALYSIS, student: { include: { user: true } } },
    orderBy: { playedAtUtc: "desc" },
    take,
  });
}

// Tenant-scoped but NOT viewer-scoped — same contract as getClassroom. The
// caller must have established its right to this game another way (a role
// gate, or matching the student's own profile id).
export async function getGame(tenantId: string, gameId: string) {
  return prisma.game.findFirst({
    where: { id: gameId, tenantId },
    include: WITH_ANALYSIS,
  });
}
