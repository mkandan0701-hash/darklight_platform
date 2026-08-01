import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-ink/15 bg-white/60 px-6 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-board-light text-board">
        {icon ?? <PawnIcon />}
      </div>
      <p className="font-display text-base font-semibold text-ink">{title}</p>
      <p className="max-w-sm text-sm text-slate">{description}</p>
      {action}
    </div>
  );
}

function PawnIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <circle cx="12" cy="6" r="2.6" fill="currentColor" />
      <path
        d="M9.5 10.5c0 1.3.7 2.4 1.8 3-1.7.6-2.8 2.2-2.8 4v1h6.8v-1c0-1.8-1.1-3.4-2.8-4 1.1-.6 1.8-1.7 1.8-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M7 20.5h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
