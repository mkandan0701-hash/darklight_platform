import { prisma } from "@chessplay-clone/db";
import type { ParsedPuzzle } from "../lib/puzzles/parsePgnPuzzles";

// Puzzle is exempt from the automatic tenant-scoping guard (see
// packages/db/src/index.ts) because it mixes global rows (source LICHESS,
// tenantId null) with private ones (source UPLOAD, tenantId set). This
// repository is what's responsible for filtering correctly instead.

export async function listUploadedPuzzles(tenantId: string) {
  return prisma.puzzle.findMany({
    where: { tenantId, source: "UPLOAD" },
    orderBy: { createdAt: "desc" },
  });
}

// Combines global LICHESS puzzles (tenantId null) with this tenant's own
// UPLOAD puzzles into one assignable pool for the homework picker. The `OR`
// on tenantId is intentional and safe only because Puzzle is exempt from the
// tenant-scoping guard (see note above) — doing this on any tenant-scoped
// model would be rejected by that guard, and rightly so.
export async function listAssignablePuzzles(
  tenantId: string,
  filters: { ratingMin?: number; ratingMax?: number; limit?: number } = {}
) {
  const { ratingMin, ratingMax, limit = 50 } = filters;
  return prisma.puzzle.findMany({
    where: {
      OR: [{ tenantId: null }, { tenantId }],
      rating:
        ratingMin !== undefined || ratingMax !== undefined
          ? { gte: ratingMin, lte: ratingMax }
          : undefined,
    },
    orderBy: { rating: "asc" },
    take: limit,
  });
}

export async function createUploadedPuzzles(
  tenantId: string,
  uploadedByUserId: string,
  puzzles: ParsedPuzzle[]
) {
  if (puzzles.length === 0) return { count: 0 };
  return prisma.puzzle.createMany({
    data: puzzles.map((puzzle) => ({
      tenantId,
      source: "UPLOAD" as const,
      uploadedByUserId,
      fen: puzzle.fen,
      moves: puzzle.moves,
      themes: [],
    })),
  });
}
