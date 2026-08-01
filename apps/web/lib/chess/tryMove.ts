import type { Chess, Move, Square } from "chess.js";

/** A move in the shape every board in this app produces: UCI-ish squares plus
 *  an optional promotion piece. `from`/`to` are plain strings because they
 *  arrive from drag handlers and socket payloads, not from chess.js itself. */
export type MoveInput = { from: string; to: string; promotion?: string };

/**
 * Attempt a move, returning `null` instead of throwing when it is illegal.
 *
 * chess.js v1 `move()` is typed as returning `Move` (never null) and **throws**
 * `Invalid move: {...}` on an illegal move. So the natural-looking
 * `const move = chess.move(...); if (!move) return false;` is dead code that
 * throws — out of a React event handler, which unmounts the board via the
 * error boundary mid-lesson.
 *
 * Use this anywhere the move comes from outside our own trusted state: a user's
 * drag, or a payload relayed from another client. Replays of moves the server
 * already validated should keep calling `chess.move()` directly, so a corrupt
 * replay surfaces loudly instead of silently desyncing the board.
 *
 * `apps/api/src/socket/rooms.ts` guards the same way server-side.
 */
export function tryMove(chess: Chess, move: MoveInput): Move | null {
  try {
    return chess.move({
      from: move.from as Square,
      to: move.to as Square,
      promotion: move.promotion,
    });
  } catch {
    return null;
  }
}
