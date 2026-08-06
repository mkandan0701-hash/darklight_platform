import { avatarIdentity } from "../../lib/avatar";
import { PIECE_NAMES, PIECE_PATHS } from "./piecePaths";

/**
 * A person, as a chess piece.
 *
 * `seed` must be `User.id` — see the reasoning on `avatarIdentity`. Passing a
 * name means the avatar changes when someone renames themselves; passing a
 * StudentProfile id means one child gets two different avatars on two pages.
 *
 * Decorative by default: this always renders beside the person's name, so a
 * label here would make a screen reader read them out twice. The caller sizes
 * it (`className="h-12 w-12"`); the SVG fills whatever box it is given.
 */
export function PieceAvatar({
  seed,
  name,
  className = "h-10 w-10",
  labelled = false,
}: {
  seed: string;
  /** Used only for the optional aria label. Never hashed. */
  name: string;
  className?: string;
  /** Set when the avatar stands alone with no adjacent name. */
  labelled?: boolean;
}) {
  const { piece, palette, motif } = avatarIdentity(seed);

  const a11y = labelled
    ? ({ role: "img", "aria-label": `${name} — ${PIECE_NAMES[piece]}` } as const)
    : ({ "aria-hidden": true, focusable: false } as const);

  return (
    <svg viewBox="0 0 100 100" className={`shrink-0 ${className}`} {...a11y}>
      <rect x="0" y="0" width="100" height="100" rx="26" fill={palette.bg} />

      {/* A faint corner checker — the second bit of identity, and a nod to the
          board motif that RankProgressBar already uses. */}
      {motif === 1 && (
        <g fill={palette.piece} opacity="0.12">
          <rect x="0" y="0" width="18" height="18" />
          <rect x="18" y="18" width="18" height="18" />
          <rect x="82" y="82" width="18" height="18" />
          <rect x="64" y="64" width="18" height="18" />
        </g>
      )}

      {/* The glyph is authored in a 100-box with ~10 units of padding, so it
          sits inside the rounded square without further transform. */}
      <path d={PIECE_PATHS[piece]} fill={palette.piece} />
    </svg>
  );
}
