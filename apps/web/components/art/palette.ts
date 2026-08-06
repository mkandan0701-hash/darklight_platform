// The brand tokens as hex literals, for SVG.
//
// SVG `fill`/`stroke` take CSS colours, not Tailwind classes, so every
// illustration in the app has to restate the palette. This was already copied
// verbatim into components/marketing/FeatureArt.tsx and HeroIllustration.tsx;
// the dashboard art, the static board and the piece avatars would have made it
// five. Same reasoning as components/ui/Badge.tsx — collect it once so a sixth
// caller doesn't have to guess which greens were the right greens.
//
// These MUST stay in sync with theme.extend.colors in tailwind.config.ts.
export const INK = "#1B2430";
export const BOARD = "#1F6D4C";
export const BOARD_DARK = "#17533A";
export const BOARD_LIGHT = "#E8F2EC";
export const GOLD = "#C9A227";
export const GOLD_LIGHT = "#F6ECC9";
export const PARCHMENT = "#F7F5EF";
export const SLATE = "#5B6472";
export const SLATE_LIGHT = "#E4E2DA";
export const BRICK = "#B3402F";
export const BRICK_LIGHT = "#F5E3DF";

/** Card faces and reversed text. Not a brand token — just white. */
export const WHITE = "#FFFFFF";
