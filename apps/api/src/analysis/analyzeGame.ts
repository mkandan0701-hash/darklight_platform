// Walks a game's positions through an engine and turns the evaluations into
// the two things a coach actually reads: an accuracy figure per side, and the
// list of moves that lost material or the game.
//
// The engine is injected rather than constructed here, so this orchestration
// is testable against a stub — the Stockfish binary is a deployment
// dependency, not a test dependency.

import { Chess } from "chess.js";
import { averageAccuracy, classifyLoss, moveAccuracy, winPercent, type MoveSeverity } from "./accuracy";
import { toWhitePov } from "./uci";
import type { Engine } from "./stockfishEngine";

export interface AnalyzedMove {
  /** 1-based half-move number. */
  ply: number;
  moveNumber: number;
  color: "w" | "b";
  san: string;
  centipawnLoss: number;
  severity: MoveSeverity;
}

export interface GameAnalysisResult {
  engineDepth: number;
  accuracyWhite: number | null;
  accuracyBlack: number | null;
  /** Only the moves worth surfacing — inaccuracies and worse. */
  mistakes: AnalyzedMove[];
  movesAnalyzed: number;
}

export const DEFAULT_DEPTH = 12;

/**
 * Evaluate every position in `pgn`.
 *
 * A move's cost is the swing between the evaluation before it and after it,
 * both read in the moving side's frame — engine scores come back relative to
 * whoever is to move, so comparing them raw would flip sign every ply and
 * score every move as a catastrophe.
 */
export async function analyzeGame(
  pgn: string,
  engine: Engine,
  opts: { depth?: number } = {}
): Promise<GameAnalysisResult> {
  const depth = opts.depth ?? DEFAULT_DEPTH;

  const source = new Chess();
  source.loadPgn(pgn);
  const moves = source.history({ verbose: true });

  const board = new Chess();
  const mistakes: AnalyzedMove[] = [];
  const accuracies: { w: number[]; b: number[] } = { w: [], b: [] };

  // Evaluation of the starting position, in White's frame.
  let evalBefore = await evaluateWhitePov(board.fen(), engine, depth);

  for (const [index, move] of moves.entries()) {
    const color = move.color as "w" | "b";
    board.move(move.san);
    const evalAfter = await evaluateWhitePov(board.fen(), engine, depth);

    // A position the engine declined to score (mate on the board, or a
    // timeout) can't be compared — skip the ply rather than invent a number.
    if (evalBefore !== null && evalAfter !== null) {
      // Into the mover's frame: for Black, a falling White-POV score is good.
      const before = color === "w" ? evalBefore : -evalBefore;
      const after = color === "w" ? evalAfter : -evalAfter;

      const loss = before - after;
      accuracies[color].push(moveAccuracy(winPercent(before), winPercent(after)));

      const severity = classifyLoss(loss);
      if (severity !== "ok") {
        mistakes.push({
          ply: index + 1,
          moveNumber: Math.floor(index / 2) + 1,
          color,
          san: move.san,
          centipawnLoss: Math.round(loss),
          severity,
        });
      }
    }

    evalBefore = evalAfter;
  }

  return {
    engineDepth: depth,
    accuracyWhite: averageAccuracy(accuracies.w),
    accuracyBlack: averageAccuracy(accuracies.b),
    mistakes,
    movesAnalyzed: accuracies.w.length + accuracies.b.length,
  };
}

async function evaluateWhitePov(
  fen: string,
  engine: Engine,
  depth: number
): Promise<number | null> {
  const score = await engine.evaluate(fen, depth);
  if (!score) return null;
  const sideToMove = fen.split(" ")[1] === "b" ? "b" : "w";
  return toWhitePov(score.cp, sideToMove);
}

/**
 * Which colour the student played, from the PGN's name tags.
 *
 * Returns null when neither tag matches any handle on file — a coach-uploaded
 * PGN, or a player whose account name differs from the one they linked. The
 * caller stores a null accuracy in that case rather than attributing the
 * game to the wrong side.
 */
export function resolveStudentColor(
  pgn: string,
  handles: (string | null | undefined)[]
): "w" | "b" | null {
  const normalized = handles
    .filter((h): h is string => Boolean(h?.trim()))
    .map((h) => h.trim().toLowerCase());
  if (normalized.length === 0) return null;

  const white = pgnTag(pgn, "White");
  const black = pgnTag(pgn, "Black");

  if (white && normalized.includes(white)) return "w";
  if (black && normalized.includes(black)) return "b";
  return null;
}

/**
 * Read one PGN seven-tag-roster value.
 *
 * Hand-scanned rather than matched with a built regex: the tag name is
 * interpolated, and the trailing space in the marker is what keeps [White ...]
 * from also matching [WhiteElo ...].
 */
function pgnTag(pgn: string, name: string): string | null {
  const marker = "[" + name + " ";
  const start = pgn.indexOf(marker);
  if (start === -1) return null;

  const openQuote = pgn.indexOf(String.fromCharCode(34), start + marker.length);
  if (openQuote === -1) return null;
  const closeQuote = pgn.indexOf(String.fromCharCode(34), openQuote + 1);
  if (closeQuote === -1) return null;

  return pgn.slice(openQuote + 1, closeQuote).trim().toLowerCase();
}
