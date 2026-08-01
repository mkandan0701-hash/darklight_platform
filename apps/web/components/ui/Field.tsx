import type { ReactNode } from "react";

export const fieldInputClass =
  "rounded-lg border border-slate/30 bg-white px-3 py-2 text-sm text-ink placeholder:text-slate/60 focus-visible:ring-2 focus-visible:ring-board focus-visible:border-board";

export function Field({
  label,
  error,
  help,
  children,
  className = "",
}: {
  label: string;
  error?: string;
  help?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm ${className}`}>
      <span className="font-medium text-ink">{label}</span>
      {children}
      {error ? (
        <span className="text-xs text-brick">{error}</span>
      ) : help ? (
        <span className="text-xs text-slate">{help}</span>
      ) : null}
    </label>
  );
}
