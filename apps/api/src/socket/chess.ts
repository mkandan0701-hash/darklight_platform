import { Chess } from "chess.js";

// chess.js v1 throws on an illegal move and on an unparseable FEN rather than
// returning null. Both are reachable from client input, so both are wrapped
// here — an unguarded call would take the whole socket handler down.
//
// apps/web has its own copy (lib/chess/tryMove.ts). Kept duplicated rather
// than shared because packages/shared has no chess.js dependency and adding
// one to pull in eight lines isn't worth the coupling.

export function safeMove(
  game: Chess,
  move: { from: string; to: string; promotion?: string }
): ReturnType<Chess["move"]> | null {
  try {
    return game.move(move);
  } catch {
    return null;
  }
}

export function safeLoadFen(fen: string): Chess | null {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}
