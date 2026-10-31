// Move classification and accuracy scoring. Pure — no engine, no database —
// so the judgement that turns raw centipawns into "this was a blunder" can be
// tested directly. It is invisible in the UI until real games accumulate,
// which is exactly how a report ships looking fine and is quietly wrong for a
// term (same reasoning as lib/attendance.ts in apps/web).

export type MoveSeverity = "blunder" | "mistake" | "inaccuracy" | "ok";

// The conventional thresholds, in centipawns lost by the side that moved.
const BLUNDER_CP = 300;
const MISTAKE_CP = 100;
const INACCURACY_CP = 50;

export function classifyLoss(centipawnLoss: number): MoveSeverity {
  if (centipawnLoss >= BLUNDER_CP) return "blunder";
  if (centipawnLoss >= MISTAKE_CP) return "mistake";
  if (centipawnLoss >= INACCURACY_CP) return "inaccuracy";
  return "ok";
}

/**
 * Centipawns to expected win percentage for the side to move.
 *
 * Raw centipawn loss is a bad basis for accuracy on its own: dropping 200cp
 * while already winning by a queen barely changes the outcome, while dropping
 * the same 200cp in a level position is decisive. Converting to win
 * probability first is what makes those two count differently. Logistic curve
 * as published by Lichess.
 */
export function winPercent(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/**
 * Accuracy (0-100) for a single move, from the win percentage before and
 * after it, both in the moving side's frame.
 */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const drop = Math.max(0, winBefore - winAfter);
  const raw = 103.1668 * Math.exp(-0.04354 * drop) - 3.1669;
  return Math.min(100, Math.max(0, raw));
}

/** Mean of per-move accuracies, or null when a side made no moves at all. */
export function averageAccuracy(perMove: number[]): number | null {
  if (perMove.length === 0) return null;
  const total = perMove.reduce((sum, value) => sum + value, 0);
  return Math.round((total / perMove.length) * 10) / 10;
}
