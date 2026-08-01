import { Chess } from "chess.js";
import { tryMove } from "../chess/tryMove";
import { moveFromUci, type EngineInfo } from "./uci";

// Rendering engine output for humans. Pure, so the sign conventions — the part
// that silently inverts an eval bar if you get it wrong — are covered by tests.

export type EvalView = {
  /** "+1.24", "-0.35", "M3", "-M2" — always from White's point of view. */
  text: string;
  /** White's share of the eval bar, 0-1. */
  fraction: number;
  isMate: boolean;
};

/** Keep a sliver of the losing side visible so the bar never reads as broken. */
const MIN_FRACTION = 0.02;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Convert one `info` line into an eval label and bar fraction.
 *
 * Stockfish reports relative to the side to move, so both the label and the
 * bar have to be flipped when Black is to move — otherwise an equal position
 * reads as winning for whoever happens to be on move.
 */
export function evalView(info: EngineInfo, sideToMove: "w" | "b"): EvalView | null {
  const flip = sideToMove === "b" ? -1 : 1;

  if (info.scoreMate !== null) {
    const mate = info.scoreMate * flip;
    return {
      text: mate >= 0 ? `M${mate}` : `-M${Math.abs(mate)}`,
      fraction: mate >= 0 ? 1 : 0,
      isMate: true,
    };
  }

  if (info.scoreCp !== null) {
    const cp = info.scoreCp * flip;
    const pawns = cp / 100;
    return {
      // Explicit sign on the positive side: "+0.30" reads as an evaluation,
      // "0.30" reads as a number.
      text: `${cp > 0 ? "+" : cp < 0 ? "−" : ""}${Math.abs(pawns).toFixed(2)}`,
      fraction: clamp(1 / (1 + Math.exp(-cp / 400)), MIN_FRACTION, 1 - MIN_FRACTION),
      isMate: false,
    };
  }

  return null;
}

/**
 * Replay a UCI principal variation into SAN for display.
 *
 * "1. e4 e5 2. Nf3" is readable; "e2e4 e7e5 g1f3" is not. Stops at the first
 * move that doesn't apply — a PV from a superseded search can be illegal in
 * the position now on the board, and that must not throw.
 */
export function pvToSan(startFen: string, pv: string[], maxPlies = 12): string[] {
  const chess = new Chess();
  try {
    chess.load(startFen);
  } catch {
    return [];
  }

  const san: string[] = [];
  for (const uci of pv.slice(0, maxPlies)) {
    const move = tryMove(chess, moveFromUci(uci));
    if (!move) break;
    san.push(move.san);
  }
  return san;
}

/**
 * Number the SAN moves of a variation, e.g. ["e4","e5","Nf3"] starting from
 * White's 1st move -> "1. e4 e5 2. Nf3".
 */
export function formatVariation(
  san: string[],
  startMoveNumber: number,
  startSide: "w" | "b"
): string {
  const parts: string[] = [];
  let moveNumber = startMoveNumber;
  let side = startSide;

  for (const move of san) {
    if (side === "w") {
      parts.push(`${moveNumber}. ${move}`);
      side = "b";
    } else {
      // Only spell out "N..." when Black opens the variation.
      parts.push(parts.length === 0 ? `${moveNumber}... ${move}` : move);
      side = "w";
      moveNumber += 1;
    }
  }
  return parts.join(" ");
}
