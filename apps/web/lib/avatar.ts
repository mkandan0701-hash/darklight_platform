// Deterministic chess-piece identities.
//
// The platform stores no images and has no upload pipeline, so an avatar has
// to be computed rather than fetched. Deriving one from the person's id gives
// every student "their piece" for free — which is the point: a child should
// recognise themselves on the page.
//
// Kept out of the component, like lib/attendance.ts, so the derivation can be
// tested directly. Components in this repo cannot be unit tested at all
// (vitest runs in `node`, with no jsdom), so anything worth asserting has to
// live in a pure function.

export type PieceKind = "p" | "n" | "b" | "r" | "q" | "k";

export type AvatarPalette = { bg: string; piece: string };

export type AvatarIdentity = {
  piece: PieceKind;
  palette: AvatarPalette;
  /** A faint corner checker, on or off — doubles the number of identities. */
  motif: 0 | 1;
};

const PIECES: readonly PieceKind[] = ["p", "n", "b", "r", "q", "k"];

// Strictly brand tokens (see components/art/palette.ts). Pairs are chosen for
// contrast of the piece against its own background, not for variety's sake.
const PALETTES: readonly AvatarPalette[] = [
  { bg: "#E8F2EC", piece: "#1F6D4C" }, // board-light / board
  { bg: "#E8F2EC", piece: "#17533A" }, // board-light / board-dark
  { bg: "#F6ECC9", piece: "#C9A227" }, // gold-light / gold
  { bg: "#F6ECC9", piece: "#1B2430" }, // gold-light / ink
  { bg: "#F5E3DF", piece: "#B3402F" }, // brick-light / brick
  { bg: "#E4E2DA", piece: "#5B6472" }, // slate-light / slate
  { bg: "#E4E2DA", piece: "#1B2430" }, // slate-light / ink
  { bg: "#F7F5EF", piece: "#1B2430" }, // parchment / ink
];

/**
 * FNV-1a, 32-bit. Deterministic, dependency-free, and stable forever.
 *
 * Changing this function re-rolls every avatar in the product — a child who
 * had a gold knight last week would silently become a grey rook. It is
 * therefore pinned by known-vector tests, which exist to make that breakage
 * loud rather than to check the arithmetic.
 */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    // >>> 0 keeps it an unsigned 32-bit int; Math.imul avoids the precision
    // loss a plain * would hit past 2^53.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * The visual identity for a seed.
 *
 * SEED WITH `User.id`, ALWAYS — never a name, and never a StudentProfile id.
 *
 * Not the name: display names have only just become settable, so name-seeding
 * would change a child's avatar the day they first type their own name, which
 * is the opposite of an identity. It would also collide for two children
 * called "Dev" in one academy, and `displayName()` falls back to the email
 * local part, so an unnamed user's avatar would move when they set a name.
 *
 * Not the StudentProfile id: the child page has both `child.id` (profile) and
 * `child.user.id` to hand. Seeding one surface from each gives the same child
 * two different avatars on the parent's home and on their own page.
 *
 * Choices are divided out of one hash rather than sliced from its bits, so
 * piece, palette and motif vary independently — bit-slicing a 32-bit FNV
 * correlates the low bits.
 */
export function avatarIdentity(seed: string): AvatarIdentity {
  const hash = hashSeed(seed);
  const piece = PIECES[hash % PIECES.length]!;
  const palette = PALETTES[Math.floor(hash / PIECES.length) % PALETTES.length]!;
  const motif = (Math.floor(hash / (PIECES.length * PALETTES.length)) % 2) as 0 | 1;
  return { piece, palette, motif };
}

/**
 * 6 pieces x 8 palettes x 2 motifs = 96 distinct identities.
 *
 * Collisions are cosmetic, not identity failures: an avatar here always
 * renders beside the person's name, never alone. The case that would matter is
 * two of one parent's own children colliding — at 96 identities with three
 * children that is roughly a 3% chance, which is the number being accepted.
 * Within a 25-student classroom repeats are expected and fine.
 */
export const AVATAR_IDENTITY_COUNT = PIECES.length * PALETTES.length * 2;
