// Flat-vector chess pieces, in the same idiom as components/marketing/
// FeatureArt.tsx: solid shapes, no gradients, no strokes on the fills.
//
// Deliberately NOT the Unicode glyphs (♔♕♖♗♘♙). app/layout.tsx loads Inter,
// Plus Jakarta Sans and IBM Plex Mono via next/font/google, and none of them
// contain U+2654–U+265F — so every glyph would fall through to whatever the
// operating system happens to have. Worse, U+265F is in the emoji set, so iOS
// and Android render some of these as full-colour emoji at the wrong baseline.
// That is a silent, per-platform visual failure on the page a child looks at.
//
// Each path is authored in a 0 0 100 100 box with ~10 units of padding, so a
// caller can position one with a plain translate() and no scaling. Shared by
// StaticBoard (64 squares) and PieceAvatar (one big glyph).

export type PieceKind = "p" | "n" | "b" | "r" | "q" | "k";

export const PIECE_KINDS: readonly PieceKind[] = ["p", "n", "b", "r", "q", "k"];

/** Human labels, for aria text. */
export const PIECE_NAMES: Record<PieceKind, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

// A common base every piece stands on — repeated rather than composed, so one
// <path> per piece keeps the DOM flat for a 64-square board.
const BASE = "M26 86h48c1.7 0 3-1.3 3-3v-4c0-1.7-1.3-3-3-3H26c-1.7 0-3 1.3-3 3v4c0 1.7 1.3 3 3 3z";

export const PIECE_PATHS: Record<PieceKind, string> = {
  // Round head, tapered neck, flared skirt.
  p: `M50 18c-6.6 0-12 5.4-12 12 0 4.1 2.1 7.7 5.2 9.9-3.4 2-5.2 4.8-5.2 8.1 0 4 2.6 7.2 6 9.6-3.7 4.6-6.6 10.6-8 18.4h28c-1.4-7.8-4.3-13.8-8-18.4 3.4-2.4 6-5.6 6-9.6 0-3.3-1.8-6.1-5.2-8.1 3.1-2.2 5.2-5.8 5.2-9.9 0-6.6-5.4-12-12-12z ${BASE}`,

  // Horse head in profile, facing left, with a mane notch.
  n: `M38 20c-2 6-8 10-13 15-4.4 4.4-7 9.6-7 16 0 3 1 5 3 6l6-5 2 6c1 3 4 4 7 3l-3 6c-1.5 3 0 6 3 7h32c1-10-1-20-5-28-4.2-8.4-10-14-17-18l3-6c1-2 0-4-2-4-3 0-6 1-9 2z ${BASE}`,

  // Mitre with the traditional slit, on a collar.
  b: `M50 16c-3.3 0-6 2.7-6 6 0 2 1 3.7 2.5 4.8-6 5-11.5 12.2-11.5 20.2 0 6 3.5 10.5 8 13l-4 6c-1 2 .3 4 2.5 4h17c2.2 0 3.5-2 2.5-4l-4-6c4.5-2.5 8-7 8-13 0-8-5.5-15.2-11.5-20.2C55 25.7 56 24 56 22c0-3.3-2.7-6-6-6zm0 14 8 10h-16z ${BASE}`,

  // Four crenellations, tapered body.
  r: `M28 20h9v7h8v-7h10v7h8v-7h9v16l-6 5c1.5 9 1.5 19 0 28H34c-1.5-9-1.5-19 0-28l-6-5z ${BASE}`,

  // Five-point coronet over a bell.
  q: `M22 30l7 18 6-20 8 20 7-22 7 22 8-20 6 20 7-18-6 40H28zM30 74h40c1 0 2 1 2 2v3H28v-3c0-1 1-2 2-2z ${BASE}`,

  // Cross above a crown and a wide collar.
  k: `M46 12h8v7h7v8h-7v6c8 2 14 9 14 17 0 6-3 11-8 14l2 12H38l2-12c-5-3-8-8-8-14 0-8 6-15 14-17v-6h-7v-8h7z ${BASE}`,
};
