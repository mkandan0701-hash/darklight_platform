// Parsing the board out of a FEN, for *drawing* it.
//
// Deliberately not chess.js, which the interactive boards use. Three reasons:
// it would pull ~100 KB into a page that only needs to draw squares; it throws
// on positions it considers illegal, and coach-uploaded study positions are
// not always legal (a puzzle with no black king is a fine thing to render);
// and a renderer that refuses to draw is worse than one that draws whatever
// it was given.
//
// The failure mode this guards against is the quiet one: an off-by-one in the
// rank/file mapping draws a *plausible but wrong* position. Nothing downstream
// can detect that — not TypeScript, not a smoke test, not a screenshot glance.
// Hence the unit tests, and hence returning null rather than guessing.

/** Lowercase = black, uppercase = white, exactly as FEN writes them. */
export type FenPiece = "p" | "n" | "b" | "r" | "q" | "k" | "P" | "N" | "B" | "R" | "Q" | "K";

export type ParsedFen = {
  /**
   * 64 entries in reading order: index 0 is a8 (top-left as White sees it),
   * index 63 is h1. This matches the order FEN itself lists ranks, so the
   * renderer can walk it straight through without arithmetic.
   */
  squares: (FenPiece | null)[];
  sideToMove: "w" | "b";
};

const PIECE_LETTERS = new Set("pnbrqkPNBRQK");

function isPiece(ch: string): ch is FenPiece {
  return PIECE_LETTERS.has(ch);
}

/**
 * Parse the placement and side-to-move fields of a FEN.
 *
 * Returns null for anything structurally wrong — a rank that doesn't sum to 8,
 * the wrong number of ranks, an unknown letter. Callers render an empty board
 * rather than throwing: one malformed row in a puzzle set must not 500 a page
 * or collapse a grid.
 *
 * Castling, en passant, and the move clocks are ignored; nothing here draws
 * them.
 */
export function parseFenBoard(fen: string): ParsedFen | null {
  if (typeof fen !== "string") return null;
  const trimmed = fen.trim();
  if (!trimmed) return null;

  const fields = trimmed.split(/\s+/);
  const placement = fields[0];
  if (!placement) return null;

  const ranks = placement.split("/");
  if (ranks.length !== 8) return null;

  const squares: (FenPiece | null)[] = [];
  for (const rank of ranks) {
    let filled = 0;
    for (const ch of rank) {
      if (ch >= "1" && ch <= "8") {
        const gap = Number(ch);
        filled += gap;
        // Overshoot has to be caught here, not after the loop: a rank of
        // "44" would otherwise push 8 nulls and look correct.
        if (filled > 8) return null;
        for (let i = 0; i < gap; i += 1) squares.push(null);
      } else if (isPiece(ch)) {
        filled += 1;
        if (filled > 8) return null;
        squares.push(ch);
      } else {
        // Covers "0", "9", and any stray letter or punctuation.
        return null;
      }
    }
    if (filled !== 8) return null;
  }

  // Belt and braces — the per-rank checks above already guarantee this.
  if (squares.length !== 64) return null;

  const sideToMove = fields[1] === "b" ? "b" : "w";
  return { squares, sideToMove };
}
