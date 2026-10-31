import type { ReactNode } from "react";
import type { LucideIcon } from "../../../../components/ui/icons";
import { Card } from "../../../../components/ui/Card";

// Shared chrome for the dashboard panels.

export function PanelHeading({
  icon: Icon,
  title,
  aside,
}: {
  icon?: LucideIcon;
  title: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      {Icon && <Icon size={17} strokeWidth={2} aria-hidden="true" className="text-slate" />}
      <h2 className="font-display text-base font-bold tracking-tight text-ink">{title}</h2>
      {aside}
    </div>
  );
}

/** Centred, muted — the reference's treatment for a panel with nothing in it. */
export function PanelEmpty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-10 text-center text-sm text-slate">{children}</p>;
}

/**
 * Shown when a panel's query failed.
 *
 * Deliberately not a zero. A failed read rendered as "0 students" is
 * indistinguishable from an academy that has none, and an admin would act on
 * it — so the panel says it could not load instead.
 */
export function PanelError({ title }: { title: string }) {
  return (
    <Card>
      <PanelHeading title={title} />
      <p className="mt-3 text-sm text-brick">
        Couldn&rsquo;t load this right now. Reload the page to try again.
      </p>
    </Card>
  );
}

/** The compact tiles inside Classroom &amp; Engagement. */
export function MetricTile({
  icon: Icon,
  tone,
  value,
  label,
  title,
}: {
  icon: LucideIcon;
  tone: "people" | "schedule" | "compete" | "work";
  value: string;
  label: string;
  title?: string;
}) {
  const tones = {
    people: "bg-board-light text-board-dark",
    schedule: "bg-gold-light text-ink",
    compete: "bg-brick-light text-brick",
    work: "bg-slate-light text-slate",
  } as const;

  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white p-3.5"
      title={title}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tones[tone]}`}
      >
        <Icon size={17} strokeWidth={2} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block font-display text-lg font-bold leading-tight text-ink">{value}</span>
        <span className="block truncate text-xs text-slate">{label}</span>
      </span>
    </div>
  );
}
