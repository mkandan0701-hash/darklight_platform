import type { Chess } from "chess.js";

/**
 * Produce a PGN worth pasting into Lichess, ChessBase or the analysis board.
 *
 * chess.js leaves `Result` as `"*"` (game in progress) even after checkmate —
 * it never sets it for you. Exporting straight from `chess.pgn()` therefore
 * marks every finished game as unfinished, and importers believe it.
 *
 * Mutates the instance's headers, which is the only API chess.js offers for
 * this; harmless because the headers are regenerated on every export.
 */
export function exportPgn(
  chess: Chess,
  meta: { white: string; black: string; result?: string; date?: Date }
): string {
  const date = meta.date ?? new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  chess.header("Event", "Casual game");
  chess.header("Site", "Chess Academy Platform");
  chess.header("Date", `${yyyy}.${mm}.${dd}`);
  chess.header("White", meta.white);
  chess.header("Black", meta.black);
  chess.header("Result", meta.result ?? "*");

  return chess.pgn();
}
