import type { ReactNode } from "react";

export const fieldInputClass =
  "rounded-lg border border-slate/30 bg-white px-3 py-2 text-sm text-ink placeholder:text-slate/60 focus-visible:ring-2 focus-visible:ring-board focus-visible:border-board";

/**
 * The larger input used on the auth pages: 48px tall (comfortable touch
 * target on a school tablet) and 16px text, which also stops iOS Safari from
 * zooming the page when the field takes focus.
 */
export const fieldInputLgClass =
  "h-12 w-full rounded-xl border border-slate/30 bg-white px-4 text-base text-ink shadow-sm shadow-ink/[0.03] transition-colors placeholder:text-slate/60 hover:border-slate/50 focus-visible:border-board focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-board/15 aria-[invalid=true]:border-brick aria-[invalid=true]:focus-visible:ring-brick/15 motion-reduce:transition-none";

/** ids a control should reference in aria-describedby when Field is given an `id`. */
export function fieldDescribedBy(id: string, { error, help }: { error?: string; help?: ReactNode }) {
  return [error ? `${id}-error` : null, help ? `${id}-help` : null].filter(Boolean).join(" ") || undefined;
}

export function Field({
  label,
  error,
  help,
  children,
  className = "",
  id,
}: {
  label: string;
  error?: string;
  help?: ReactNode;
  children: ReactNode;
  className?: string;
  /**
   * The control's id. When set, the label is linked with htmlFor instead of
   * wrapping the control, and help/error text get `${id}-help` / `${id}-error`
   * so the control can point aria-describedby at them (see fieldDescribedBy).
   * Needed when the control sits beside a button — a wrapping <label> would
   * make the show/hide toggle part of the label.
   */
  id?: string;
}) {
  if (!id) {
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

  // Help stays visible alongside an error here: on the auth pages the help is
  // the rule ("at least 8 characters") and the error is the breach of it, and
  // a child needs both.
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {help && (
        <div id={`${id}-help`} className="text-sm text-slate">
          {help}
        </div>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-brick">
          {error}
        </p>
      )}
    </div>
  );
}
