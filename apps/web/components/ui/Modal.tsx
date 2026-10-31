"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ICON_PROPS, X } from "./icons";

// The first dialog in this app — there was no modal, popover or drawer
// anywhere before the PGN library needed one.
//
// Built on the native <dialog> element rather than a div with a fixed
// position, because showModal() brings the things a hand-rolled overlay
// usually gets wrong: the rest of the page becomes inert, focus is trapped
// inside, Escape closes, and it renders in the top layer so no z-index on an
// ancestor can bury it.

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Escape fires the dialog's own close event rather than our handler, so the
  // parent's state would otherwise stay true and the dialog could not reopen.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handle = () => onClose();
    dialog.addEventListener("close", handle);
    dialog.addEventListener("cancel", handle);
    return () => {
      dialog.removeEventListener("close", handle);
      dialog.removeEventListener("cancel", handle);
    };
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      // The backdrop is the ::backdrop pseudo-element, styled in globals.css.
      className="w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-ink/10 bg-white p-0 text-ink shadow-lg backdrop:bg-ink/40"
      onClick={(e) => {
        // Clicking the backdrop lands on the dialog itself, never on a child.
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="flex items-start gap-3 border-b border-ink/10 px-5 py-4">
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold tracking-tight text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-slate">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ml-auto rounded-lg p-1.5 text-slate hover:bg-parchment hover:text-ink"
        >
          <X {...ICON_PROPS} size={17} aria-hidden="true" />
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
    </dialog>
  );
}

/** Right-aligned Cancel/confirm pair, so every dialog ends the same way. */
export function ModalFooter({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex flex-wrap justify-end gap-2">{children}</div>;
}
