"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Toggle } from "../../../../components/ui/Toggle";
import { fieldInputClass } from "../../../../components/ui/Field";
import { ICON_PROPS, Search, X } from "../../../../components/ui/icons";
import { SORT_OPTIONS, type SortMode } from "../../../../lib/pgn/library";

// Search, sort and the reorder switch.
//
// All three live in the URL rather than in component state, so the server does
// the filtering, a reload keeps your place, and the view can be sent to a
// colleague. Typing is debounced because every keystroke would otherwise be a
// navigation, and each navigation is a query.

const DEBOUNCE_MS = 250;

export function LibraryToolbar({
  query,
  sort,
  canManage,
}: {
  query: string;
  sort: SortMode;
  canManage: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState(query);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // Keeps the box in step when the URL changes from elsewhere — the back
  // button, or clearing the search from the empty state.
  useEffect(() => {
    setDraft(query);
  }, [query]);

  function navigate(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    // Any change to what is being listed invalidates the page number: landing
    // on page 3 of a 1-page result is how an empty grid with a live Next
    // button happens.
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function onSearchChange(value: string) {
    setDraft(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => navigate({ q: value.trim() || null }), DEBOUNCE_MS);
  }

  function clearSearch() {
    clearTimeout(timer.current);
    setDraft("");
    navigate({ q: null });
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  const sortingActive = sort !== "none";

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <div className="flex items-center gap-2">
        <span id="reorder-label" className="text-sm text-ink">
          Reorder folders and pgns
        </span>
        {/* Rendered, but honestly: drag-to-reorder is not built yet, and a
            switch that flips and does nothing is worse than one that explains
            itself. It is also mutually exclusive with sorting — a manual order
            cannot be written back while a column is deciding the order. */}
        <Toggle
          checked={false}
          disabled
          label="Reorder folders and pgns"
          title={
            !canManage
              ? "Only coaches and academy admins can reorder the library."
              : sortingActive
                ? "Turn sorting off first — a manual order can't be saved while a sort is applied."
                : "Drag-to-reorder isn't built yet."
          }
        />
      </div>

      <div className="relative">
        <Search
          {...ICON_PROPS}
          size={15}
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate"
        />
        <input
          type="search"
          value={draft}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search folders and PGN..."
          aria-label="Search folders and PGN files"
          className={`${fieldInputClass} w-56 pl-8 pr-8`}
        />
        {draft.length > 0 && (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate hover:text-ink"
          >
            <X size={14} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>

      <select
        value={sort}
        onChange={(e) => navigate({ sort: e.target.value === "none" ? null : e.target.value })}
        aria-label="Sort folders and files"
        className={`${fieldInputClass} w-40`}
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
