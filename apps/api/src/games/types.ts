// One normalized shape both providers map onto, so the persistence layer
// (gameSync.ts) never branches on where a game came from.
export interface SyncedGame {
  externalId: string;
  pgn: string;
  playedAtUtc: Date;
  /** Standard PGN result notation, from White's perspective. */
  result: "1-0" | "0-1" | "1/2-1/2";
}

// Games that never really happened (aborted, abandoned before a move) are
// dropped rather than stored: they would pad a student's game count and skew
// any accuracy figure computed over their history.
export const DRAW = "1/2-1/2" as const;
export const WHITE_WIN = "1-0" as const;
export const BLACK_WIN = "0-1" as const;
