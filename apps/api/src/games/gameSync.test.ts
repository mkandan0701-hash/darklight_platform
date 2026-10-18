import { beforeEach, describe, expect, it, vi } from "vitest";

const gameCreateMany = vi.fn();
const gameFindFirst = vi.fn();
const studentFindMany = vi.fn();
const tenantFindMany = vi.fn();

vi.mock("@chessplay-clone/db", () => ({
  prisma: {
    game: {
      createMany: (...a: unknown[]) => gameCreateMany(...a),
      findFirst: (...a: unknown[]) => gameFindFirst(...a),
    },
    studentProfile: { findMany: (...a: unknown[]) => studentFindMany(...a) },
  },
  prismaBase: { tenant: { findMany: (...a: unknown[]) => tenantFindMany(...a) } },
  runWithTenant: (_tenantId: string, fn: () => unknown) => fn(),
}));

// Static import, not `await import()`: apps/api compiles to commonjs, which
// has no top-level await. Safe because every mock factory above returns
// closures that dereference the vi.fn()s at call time, not at factory time.
import { latestPlayedAt, listSyncTargets, persistSyncedGames } from "./gameSync";

const game = {
  externalId: "abc",
  pgn: "1. e4",
  playedAtUtc: new Date("2026-09-01T00:00:00.000Z"),
  result: "1-0" as const,
};

beforeEach(() => {
  [gameCreateMany, gameFindFirst, studentFindMany, tenantFindMany].forEach((m) => m.mockReset());
  gameCreateMany.mockResolvedValue({ count: 1 });
  gameFindFirst.mockResolvedValue(null);
  studentFindMany.mockResolvedValue([]);
  tenantFindMany.mockResolvedValue([]);
});

describe("persistSyncedGames", () => {
  // The whole idempotency claim of CLAUDE.md §3.8 rests on this flag plus
  // @@unique([source, externalId]): without it a retried nightly job would
  // duplicate a student's entire game history.
  it("writes with skipDuplicates so a re-run imports nothing twice", async () => {
    await persistSyncedGames("tenant_1", "stu_1", "LICHESS", [game]);
    const args = gameCreateMany.mock.calls[0][0];
    expect(args.skipDuplicates).toBe(true);
    expect(args.data).toEqual([
      {
        tenantId: "tenant_1",
        studentId: "stu_1",
        source: "LICHESS",
        externalId: "abc",
        pgn: "1. e4",
        playedAtUtc: game.playedAtUtc,
        result: "1-0",
      },
    ]);
  });

  it("does not hit the database at all for an empty sync", async () => {
    expect(await persistSyncedGames("tenant_1", "stu_1", "LICHESS", [])).toEqual({ imported: 0 });
    expect(gameCreateMany).not.toHaveBeenCalled();
  });
});

describe("latestPlayedAt", () => {
  it("asks for the newest game for this student and source only", async () => {
    gameFindFirst.mockResolvedValue({ playedAtUtc: game.playedAtUtc });
    expect(await latestPlayedAt("tenant_1", "stu_1", "CHESSCOM")).toEqual(game.playedAtUtc);
    expect(gameFindFirst.mock.calls[0][0]).toMatchObject({
      where: { tenantId: "tenant_1", studentId: "stu_1", source: "CHESSCOM" },
      orderBy: { playedAtUtc: "desc" },
    });
  });

  it("returns undefined for a student with no games yet", async () => {
    expect(await latestPlayedAt("tenant_1", "stu_1", "LICHESS")).toBeUndefined();
  });
});

describe("listSyncTargets", () => {
  it("filters on the handle column belonging to the requested source", async () => {
    tenantFindMany.mockResolvedValue([{ id: "tenant_1" }]);
    await listSyncTargets("LICHESS");
    expect(studentFindMany.mock.calls[0][0].where).toEqual({
      tenantId: "tenant_1",
      lichessHandle: { not: null },
    });

    studentFindMany.mockClear();
    await listSyncTargets("CHESSCOM");
    expect(studentFindMany.mock.calls[0][0].where).toEqual({
      tenantId: "tenant_1",
      chesscomHandle: { not: null },
    });
  });

  it("returns one target per student, carrying that source's handle", async () => {
    tenantFindMany.mockResolvedValue([{ id: "tenant_1" }]);
    studentFindMany.mockResolvedValue([
      { id: "stu_1", lichessHandle: "asha", chesscomHandle: null },
      { id: "stu_2", lichessHandle: "  ", chesscomHandle: null },
    ]);

    // stu_2's whitespace-only handle would produce a request to
    // lichess.org/api/games/user/ — a 404 every night, forever.
    expect(await listSyncTargets("LICHESS")).toEqual([
      { tenantId: "tenant_1", studentId: "stu_1", handle: "asha" },
    ]);
  });
});
