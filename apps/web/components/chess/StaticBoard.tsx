import { parseFenBoard, type FenPiece } from "../../lib/chess/parseFen";
import type { PieceKind } from "./piecePaths";
import { CburnettPiece, PIECE_BOX } from "./cburnett";
import { BOARD, BOARD_LIGHT, INK } from "../art/palette";

// A chess position, drawn as inert SVG.
//
// Deliberately NOT react-chessboard, which the interactive surfaces use. That
// library ships ~240 KB of ESM plus three react-dnd packages, and mounting one
// DndProvider tree per thumbnail — on a gallery of a dozen puzzles, opened by a
// nine-year-old on a school tablet — buys nothing, because none of these boards
// can be touched. This renders on the server and ships zero JavaScript.
//
// PROP RULE: narrow scalars only. Never pass a Prisma `Puzzle` row in. The row
// carries `moves` — the solution — and if this ever renders inside a client
// component that would be serialized into the RSC payload, putting the answer
// in view-source.

const SQUARE = 100;

function glyphFor(piece: FenPiece): { kind: PieceKind; isWhite: boolean } {
  const lower = piece.toLowerCase() as PieceKind;
  return { kind: lower, isWhite: piece === piece.toUpperCase() };
}

export function StaticBoard({
  fen,
  orientation = "auto",
  label,
  className = "",
}: {
  fen: string;
  /**
   * "auto" shows the position from the side to move, which is the puzzle
   * convention on Lichess and Chess.com — a mate-in-2 for Black read upside
   * down is materially harder for a child.
   */
  orientation?: "white" | "black" | "auto";
  /**
   * Provide ONLY when the board is the sole carrier of meaning. On a card
   * whose link text already reads "Puzzle 3 · Mate in 2 · Black to move", a
   * label here would make a screen reader announce the same fact twice, so the
   * default is decorative. Never attempt a square-by-square description: a
   * blind student cannot solve from a thumbnail, and the caption carries it.
   */
  label?: string;
  className?: string;
}) {
  const parsed = parseFenBoard(fen);
  // A malformed FEN draws an empty board rather than throwing. One bad row in
  // an imported puzzle set must not 500 a page or collapse a grid.
  const squares = parsed?.squares ?? Array<null>(64).fill(null);
  const flipped =
    orientation === "black" || (orientation === "auto" && parsed?.sideToMove === "b");

  const a11y = label
    ? ({ role: "img", "aria-label": label } as const)
    : ({ "aria-hidden": true, focusable: false } as const);

  return (
    <svg viewBox="0 0 800 800" className={`h-auto w-full ${className}`} {...a11y}>
      {/* crispEdges kills the sub-pixel seams that show between squares at
          thumbnail sizes on fractional-DPR displays. */}
      <g shapeRendering="crispEdges">
        {squares.map((_, i) => {
          const row = Math.floor(i / 8);
          const col = i % 8;
          const dark = (row + col) % 2 === 1;
          return (
            <rect
              key={`sq-${i}`}
              x={col * SQUARE}
              y={row * SQUARE}
              width={SQUARE}
              height={SQUARE}
              fill={dark ? BOARD : BOARD_LIGHT}
            />
          );
        })}
      </g>

      {squares.map((piece, i) => {
        if (!piece) return null;
        // squares[] is always in a8..h1 order; flipping is a render-time
        // concern, so the index is mapped here rather than the array reversed.
        const index = flipped ? 63 - i : i;
        const row = Math.floor(index / 8);
        const col = index % 8;
        const { kind, isWhite } = glyphFor(piece);
        return (
          <g
            key={`pc-${i}`}
            // The Cburnett paths are authored in a 45-unit box, so each one is
            // scaled to fill its square — the same transform react-chessboard
            // applies. Stroke widths scale with it, by design.
            transform={`translate(${col * SQUARE} ${row * SQUARE}) scale(${SQUARE / PIECE_BOX})`}
          >
            <CburnettPiece kind={kind} isWhite={isWhite} />
          </g>
        );
      })}

      <rect
        x={0}
        y={0}
        width={800}
        height={800}
        fill="none"
        stroke={INK}
        strokeOpacity="0.15"
        strokeWidth={6}
      />
    </svg>
  );
}
