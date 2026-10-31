"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { DateTime } from "luxon";
import type { CalendarEvent, CalendarStatus } from "../../../../lib/calendar/events";
import type { ScheduleConflict } from "../../../../lib/calendar/conflicts";
import type { CalendarActionResult } from "./actions";
import { STATUS_LABELS } from "./categoryStyles";

// Small pieces shared by the views and dialogs. Every time on screen goes
// through these, in the zone the calendar is displaying — never the zone an
// event was booked in, which is shown separately as a footnote.

export const inZone = (iso: string, zone: string) => DateTime.fromISO(iso, { zone: "utc" }).setZone(zone);

export function fmtTime(iso: string, zone: string): string {
  return inZone(iso, zone).toFormat("h:mm a");
}

/** "Sat, 17 Oct · 6:00 – 7:00 PM GMT+5:30", or the all-day equivalent. */
export function fmtEventWhen(e: CalendarEvent, zone: string): string {
  const s = inZone(e.startUtc, zone);
  const en = inZone(e.endUtc, zone);
  if (e.allDay) {
    const last = en.minus({ minutes: 1 });
    return s.hasSame(last, "day")
      ? `${s.toFormat("ccc, d LLL yyyy")} · All day`
      : `${s.toFormat("ccc, d LLL")} – ${last.toFormat("ccc, d LLL yyyy")} · All day`;
  }
  if (e.category === "HOMEWORK") return `Due ${en.toFormat("ccc, d LLL yyyy 'at' h:mm a ZZZZ")}`;
  if (s.hasSame(en, "day")) {
    return `${s.toFormat("ccc, d LLL yyyy")} · ${s.toFormat("h:mm a")} – ${en.toFormat("h:mm a ZZZZ")}`;
  }
  return `${s.toFormat("ccc, d LLL, h:mm a")} – ${en.toFormat("ccc, d LLL, h:mm a ZZZZ")}`;
}

/** The same instant on the booker's wall clock, when that differs from ours. */
export function bookedZoneNote(e: CalendarEvent, zone: string): string | null {
  if (!e.timezone || e.timezone === zone || e.allDay) return null;
  const theirs = inZone(e.startUtc, e.timezone);
  const ours = inZone(e.startUtc, zone);
  if (theirs.offset === ours.offset) return null;
  return `Scheduled as ${theirs.toFormat("ccc h:mm a")} ${e.timezone.replace(/_/g, " ")} time`;
}

export function toLocalInput(iso: string, zone: string): string {
  return inZone(iso, zone).toFormat("yyyy-LL-dd'T'HH:mm");
}

const STATUS_TONES: Record<CalendarStatus, string> = {
  UPCOMING: "bg-blue-50 text-blue-800",
  LIVE: "bg-board text-white",
  COMPLETED: "bg-parchment text-slate",
  CANCELLED: "bg-brick-light text-brick",
};

export function StatusPill({ status }: { status: CalendarStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function ConflictList({ conflicts, zone }: { conflicts: ScheduleConflict[]; zone: string }) {
  return (
    <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
      {conflicts.map((c, i) => (
        <li key={i} className="rounded-md bg-gold-light/70 px-2 py-1 text-ink">
          <span className="font-medium">{inZone(c.occurrenceStartUtc, zone).toFormat("ccc d LLL, h:mm a")}</span>
          {" — "}
          {c.message} ({fmtTime(c.otherStartUtc, zone)}–{fmtTime(c.otherEndUtc, zone)})
        </li>
      ))}
    </ul>
  );
}

/**
 * Runs a server action and turns a dropped connection into an ordinary
 * failure, so no caller can mistake "the request never arrived" for success.
 */
export async function callAction(
  run: () => Promise<CalendarActionResult>
): Promise<CalendarActionResult> {
  try {
    return await run();
  } catch {
    return { ok: false, error: "Couldn't reach the server — nothing was saved. Check your connection and try again." };
  }
}

/** Button + floating panel; closes on outside click and Escape. */
export function Popover({
  label,
  button,
  children,
  align = "left",
  buttonClassName = "",
}: {
  label: string;
  button: ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={buttonClassName}
      >
        {button}
      </button>
      {open && (
        <div
          className={`absolute z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-ink/10 bg-white p-3 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export const selectClass =
  "rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink focus-visible:border-board focus-visible:ring-2 focus-visible:ring-board";
