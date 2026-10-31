import type { LucideIcon } from "./icons";
import { STAT_ICON_PROPS } from "./icons";
import { Card } from "./Card";
import type { DeltaTone } from "../../lib/metrics";

// The reference design puts six different pastel hues in this row — blue,
// green, amber, purple, violet, pink. This palette has four hues, not six, and
// inventing two more to fill the row would mean two colours that mean nothing
// and belong to no other part of the product.
//
// So the tones are assigned by meaning instead, and repeat where the meaning
// repeats: people are green, scheduling is gold, competition is brick, routine
// work is slate. A pair sharing a colour reads as a pair, which is truer than
// a rainbow would be.
const TONE_CLASSES = {
  people: "bg-board-light text-board-dark",
  schedule: "bg-gold-light text-ink",
  compete: "bg-brick-light text-brick",
  work: "bg-slate-light text-slate",
} as const;

export type StatTone = keyof typeof TONE_CLASSES;

const NOTE_TONE_CLASSES: Record<DeltaTone, string> = {
  up: "text-board",
  down: "text-brick",
  flat: "text-slate",
};

export interface StatCardProps {
  icon: LucideIcon;
  tone: StatTone;
  /** Already formatted — "12", "0", "—". Never a raw number needing a fallback. */
  value: string;
  label: string;
  /** The small line underneath. Omitted rather than faked when unknown. */
  note?: string;
  /** A rise reads green, a fall reads brick, no change stays muted. */
  noteTone?: DeltaTone;
  /** Explains how the number is derived, for anything non-obvious. */
  title?: string;
}

export function StatCard({
  icon: Icon,
  tone,
  value,
  label,
  note,
  noteTone = "flat",
  title,
}: StatCardProps) {
  return (
    <Card className="p-4" title={title}>
      <span
        className={`mb-6 flex h-9 w-9 items-center justify-center rounded-full ${TONE_CLASSES[tone]}`}
      >
        <Icon {...STAT_ICON_PROPS} aria-hidden="true" />
      </span>
      <p className="font-display text-2xl font-bold leading-none text-ink">{value}</p>
      <p className="mt-1.5 text-sm text-ink">{label}</p>
      {note && <p className={`mt-1 text-xs ${NOTE_TONE_CLASSES[noteTone]}`}>{note}</p>}
    </Card>
  );
}
