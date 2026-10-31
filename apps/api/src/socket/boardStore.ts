import { Chess } from "chess.js";
import type { Redis } from "ioredis";

export const START_FEN = new Chess().fen();

// Long enough to outlast any realistic lesson, short enough that abandoned
// sessions don't accumulate in Redis forever. Refreshed on every write.
const TTL_SECONDS = 60 * 60 * 8;

// "simul" keys a single board of a simultaneous exhibition, which is the
// same two-player board shape as a lesson but scoped per SimulBoard row
// rather than per LiveSession.
export type BoardKind = "shared" | "ref" | "simul";

export function boardKey(boardId: string, kind: BoardKind): string {
  if (kind === "simul") return `simul:${boardId}:fen`;
  return kind === "shared" ? `session:${boardId}:fen` : `session:${boardId}:ref-fen`;
}

// Compare-and-set. Two clients moving at the same instant would otherwise both
// read the same FEN, both validate against it, and both write — losing a move
// and leaving the room's clients disagreeing about the position. Only the
// client whose `expected` still matches wins; the loser's move is rejected and
// its client resyncs from the `game-state` broadcast.
//
// An absent key means "nobody has moved yet", which is the start position, so
// a first move must be allowed to CAS against START_FEN.
//
// KEYS[1] board key. ARGV: 1 expected, 2 next, 3 start FEN, 4 ttl seconds.
const CAS_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current == false then
  if ARGV[1] ~= ARGV[3] then return 0 end
elseif current ~= ARGV[1] then
  return 0
end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[4])
return 1
`;

export type BoardStore = {
  getFen(liveSessionId: string, kind?: BoardKind): Promise<string>;
  compareAndSetFen(
    liveSessionId: string,
    expectedFen: string,
    nextFen: string,
    kind?: BoardKind
  ): Promise<boolean>;
  setFen(liveSessionId: string, fen: string, kind?: BoardKind): Promise<void>;
  clearFen(liveSessionId: string, kind?: BoardKind): Promise<void>;
};

// Board state lives in Redis rather than in a module-level Map so that it
// survives an API restart and is shared across instances — the Socket.io Redis
// adapter makes *broadcasts* cross-instance, but without this the authoritative
// position would still be per-process. See chessplay-clone-spec.md §3.4.
export function createBoardStore(redis: Redis): BoardStore {
  return {
    async getFen(liveSessionId, kind = "shared") {
      const fen = await redis.get(boardKey(liveSessionId, kind));
      return fen ?? START_FEN;
    },

    async compareAndSetFen(liveSessionId, expectedFen, nextFen, kind = "shared") {
      const result = await redis.eval(
        CAS_SCRIPT,
        1,
        boardKey(liveSessionId, kind),
        expectedFen,
        nextFen,
        START_FEN,
        String(TTL_SECONDS)
      );
      return Number(result) === 1;
    },

    // Unconditional overwrite — for ref-board-load/clear, where the coach is
    // replacing the position outright rather than advancing it by a move.
    async setFen(liveSessionId, fen, kind = "shared") {
      await redis.set(boardKey(liveSessionId, kind), fen, "EX", TTL_SECONDS);
    },

    async clearFen(liveSessionId, kind = "shared") {
      await redis.del(boardKey(liveSessionId, kind));
    },
  };
}
