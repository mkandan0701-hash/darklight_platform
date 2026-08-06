import type { HTMLAttributes } from "react";

// The pill that had been re-typed inline at five call sites (the live board's
// audio chips, the members role tags, puzzle status, attendance "N marked",
// the classroom LIVE dot). Same base, same tone pairs — collected here so a
// sixth one doesn't have to guess which greens were the right greens.
const TONE_CLASSES = {
  neutral: "bg-parchment text-slate",
  success: "bg-board-light text-board-dark",
  warn: "bg-gold-light text-ink",
  danger: "bg-brick-light text-brick",
  // Filled rather than tinted: for the one badge on a row that should read as
  // a state, not a label — a session that is live right now.
  solid: "bg-board text-white",
} as const;

export type BadgeTone = keyof typeof TONE_CLASSES;

export function Badge({
  tone = "neutral",
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      {...props}
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${TONE_CLASSES[tone]} ${className}`}
    />
  );
}
