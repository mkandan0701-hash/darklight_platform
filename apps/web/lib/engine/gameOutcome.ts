import type { Chess } from "chess.js";

// Turning a chess.js position into a result the player can read. Pure over a
// Chess instance so it is testable under `environment: "node"`.

export type Outcome =
  | { over: false }
  | {
      over: true;
      /** PGN-style result, matching the `Game.result` convention. */
      result: "1-0" | "0-1" | "1/2-1/2";
      /** Whether the human player won, lost, or drew. */
      forPlayer: "win" | "loss" | "draw";
      /** One short sentence for the UI. */
      reason: string;
    };

/**
 * Describe the position's outcome from `playerColor`'s point of view.
 *
 * The draw branches are ordered most-specific first: chess.js `isDraw()` is
 * true for stalemate, insufficient material, threefold and fifty-move alike,
 * so checking it early would collapse every draw into "drawn" and lose the
 * explanation a student actually learns from.
 */
export function describeOutcome(chess: Chess, playerColor: "w" | "b"): Outcome {
  if (!chess.isGameOver()) return { over: false };

  const opponentColor = playerColor === "w" ? "b" : "w";

  if (chess.isCheckmate()) {
    // The side to move is the one that got mated.
    const loser = chess.turn();
    const playerWon = loser === opponentColor;
    return {
      over: true,
      result: loser === "w" ? "0-1" : "1-0",
      forPlayer: playerWon ? "win" : "loss",
      reason: playerWon ? "Checkmate — you win." : "Checkmate — the engine wins.",
    };
  }

  const draw = (reason: string): Outcome => ({
    over: true,
    result: "1/2-1/2",
    forPlayer: "draw",
    reason,
  });

  if (chess.isStalemate()) return draw("Stalemate — the side to move has no legal move.");
  if (chess.isInsufficientMaterial()) {
    return draw("Draw — neither side has enough material to mate.");
  }
  if (chess.isThreefoldRepetition()) {
    return draw("Draw by threefold repetition.");
  }
  if (chess.isDrawByFiftyMoves()) {
    return draw("Draw by the fifty-move rule.");
  }

  return draw("Draw.");
}

/** The result string for a resignation by `playerColor`. */
export function resignationOutcome(playerColor: "w" | "b"): Extract<Outcome, { over: true }> {
  return {
    over: true,
    result: playerColor === "w" ? "0-1" : "1-0",
    forPlayer: "loss",
    reason: "You resigned.",
  };
}
