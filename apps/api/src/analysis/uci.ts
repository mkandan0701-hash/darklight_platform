// The slice of the UCI protocol queued analysis needs: a score off an `info`
// line, and the end-of-search `bestmove`.
//
// apps/web/lib/engine/uci.ts parses the same protocol far more fully, for the
// browser's live analysis board (MultiPV, node counts, bounds, PV lines). That
// copy can't be imported here — it lives in the Next app — and this one needs
// four fields, so the duplication is the smaller cost. Same posture as the two
// liveSessionRepository files. If a third consumer appears, move the web copy
// to packages/shared and delete this.

/** Centipawn magnitude a forced mate maps to — above any real evaluation. */
export const MATE_SCORE = 100_000;

export interface UciScore {
  /** Centipawns from the side-to-move's perspective. Mate is ±MATE_SCORE. */
  cp: number;
  depth: number | null;
  /** True when the score came from `score mate`, not `score cp`. */
  mate: boolean;
}

/**
 * Parse the score out of one `info` line, or null if it carries none.
 *
 * Deliberately ignores lines with `lowerbound`/`upperbound`: those are
 * fail-high/fail-low artefacts of an unfinished window, not a settled
 * evaluation, and treating one as final is how a quiet move gets scored as a
 * blunder.
 */
export function parseScoreLine(line: string): UciScore | null {
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] !== "info") return null;
  if (tokens.includes("lowerbound") || tokens.includes("upperbound")) return null;

  const scoreIndex = tokens.indexOf("score");
  if (scoreIndex === -1) return null;

  const kind = tokens[scoreIndex + 1];
  const raw = Number.parseInt(tokens[scoreIndex + 2] ?? "", 10);
  if (Number.isNaN(raw)) return null;

  const depthIndex = tokens.indexOf("depth");
  const depth = depthIndex === -1 ? null : Number.parseInt(tokens[depthIndex + 1] ?? "", 10);

  if (kind === "cp") {
    return { cp: raw, depth: Number.isNaN(depth as number) ? null : depth, mate: false };
  }
  if (kind === "mate") {
    // Sign carries which side is mating; magnitude shrinks as mate nears, so
    // a mate in 1 must outrank a mate in 5.
    const signed = raw >= 0 ? MATE_SCORE - raw : -MATE_SCORE - raw;
    return { cp: signed, depth: Number.isNaN(depth as number) ? null : depth, mate: true };
  }
  return null;
}

export function isBestMoveLine(line: string): boolean {
  return line.trim().startsWith("bestmove");
}

/** Flip a side-to-move score into White's frame, so plies are comparable. */
export function toWhitePov(cp: number, sideToMove: "w" | "b"): number {
  return sideToMove === "w" ? cp : -cp;
}
