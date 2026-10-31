"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ICON_PROPS } from "../../ui/icons";

/**
 * The account control in the header.
 *
 * The first real dropdown in this app — there was no menu, popover or combobox
 * anywhere — so it carries the keyboard and focus behaviour by hand: Escape
 * closes and returns focus to the trigger, a click outside closes, and the
 * trigger is wired to the menu with aria-expanded/aria-controls.
 *
 * `logoutAction` is a server action passed down from the layout, which is why
 * logging out still happens on the server with no client-side auth handling.
 */
export function AccountMenu({
  name,
  email,
  logoutAction,
}: {
  name: string;
  email: string;
  logoutAction: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      // Without this, focus is left on a node that just disappeared and a
      // keyboard user is dropped back at the top of the document.
      triggerRef.current?.focus();
    };
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  const initial = (name.trim()[0] ?? "?").toUpperCase();

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className="flex max-w-[220px] items-center gap-2 rounded-lg border border-ink/10 bg-white px-2 py-1.5 text-left shadow-sm hover:bg-ink/[0.03]"
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-board text-xs font-semibold text-white"
          aria-hidden="true"
        >
          {initial}
        </span>
        <span className="hidden min-w-0 flex-col leading-tight sm:flex">
          <span className="truncate text-xs font-medium text-ink">{name}</span>
          <span className="truncate text-[11px] text-slate">{email}</span>
        </span>
        <ChevronDown {...ICON_PROPS} size={15} aria-hidden="true" className="shrink-0 text-slate" />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-ink/10 bg-white py-1 shadow-lg"
        >
          <p className="truncate px-3 py-2 text-xs text-slate sm:hidden">{email}</p>
          <Link
            href="/dashboard/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-ink hover:bg-parchment"
          >
            Profile
          </Link>
          <form action={logoutAction} className="border-t border-ink/5">
            <button
              type="submit"
              role="menuitem"
              className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-parchment"
            >
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
