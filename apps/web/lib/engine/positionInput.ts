import { Chess, DEFAULT_POSITION, validateFen } from "chess.js";
import { splitPgnGames } from "../puzzles/parsePgnPuzzles";
import { uciFromMove } from "./uci";

// Turns whatever a coach pastes into the analysis board into a position the
// engine can search. Pure, so the messy real-world input cases are covered by
// Vitest rather than discovered by a user.
//
// Deliberately more permissive than lib/puzzles/parsePgnPuzzles.ts, which
// requires a [FEN] tag because every puzzle needs a start position. A game
// PGN normally starts from the initial position and has no such tag.

export type ParsedPosition = {
  /** Position to start from — the initial position unless the PGN said otherwise. */
  startFen: string;
  /** Moves from `startFen`, as UCI. */
  uciMoves: string[];
  source: "fen" | "pgn";
};

export type PositionInputResult =
  | { ok: true; position: ParsedPosition }
  | { ok: false; error: string };

/**
 * chess.js `validateFen` demands all six fields, but boards and engine dumps
 * routinely emit only four (through the en-passant square). Pad the halfmove
 * clock and fullmove number rather than rejecting input a human would call a
 * perfectly good FEN.
 */
function normalizeFen(candidate: string): string {
  const fields = candidate.trim().split(/\s+/);
  if (fields.length === 4) return [...fields, "0", "1"].join(" ");
  if (fields.length === 5) return [...fields, "1"].join(" ");
  return fields.join(" ");
}

function looksLikePgn(text: string): boolean {
  // A tag pair, or a move number like "1." / "12...".
  return /^\s*\[/.test(text) || /\b\d+\.(\.\.)?\s*[A-Za-z]/.test(text);
}

export function parsePositionInput(text: string): PositionInputResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: "Paste a FEN or a PGN to analyse." };
  }

  if (!looksLikePgn(trimmed)) {
    const fen = normalizeFen(trimmed);
    const validation = validateFen(fen);
    if (validation.ok) {
      return { ok: true, position: { startFen: fen, uciMoves: [], source: "fen" } };
    }
    return {
      ok: false,
      error: `That doesn't look like a valid FEN or PGN. ${validation.error ?? ""}`.trim(),
    };
  }

  // Multi-game paste (a whole Lichess export): analyse the first game.
  const [firstGame] = splitPgnGames(trimmed);
  if (!firstGame) {
    return { ok: false, error: "No game found in that PGN." };
  }

  const chess = new Chess();
  try {
    // chess.js v1 throws on malformed PGN rather than returning false.
    chess.loadPgn(firstGame);
  } catch (err) {
    return { ok: false, error: `Couldn't read that PGN: ${(err as Error).message}` };
  }

  const history = chess.history({ verbose: true });
  const startFen = chess.header().FEN ?? DEFAULT_POSITION;

  if (history.length === 0) {
    // A headers-only paste still gives a usable position, so this is only an
    // error when there's no start position to fall back to either.
    if (startFen === DEFAULT_POSITION && !chess.header().FEN) {
      return { ok: false, error: "That PGN has no moves." };
    }
  }

  return {
    ok: true,
    position: {
      startFen,
      uciMoves: history.map(uciFromMove),
      source: "pgn",
    },
  };
}
