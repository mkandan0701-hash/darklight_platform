"use client";

import { DateTime } from "luxon";
import type { CalendarEvent } from "../../../../lib/calendar/events";
import { CATEGORY_STYLES } from "./categoryStyles";
import { fmtTime } from "./shared";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS = 3;

export type DropTarget = { day: string; minutes?: number };

/** Classes the viewer may move, and only while they're still ahead. */
export function isMovable(e: CalendarEvent): boolean {
  return e.canEdit && e.category === "CLASS" && e.status === "UPCOMING";
}

export function EventChip({
  event,
  zone,
  onOpen,
}: {
  event: CalendarEvent;
  zone: string;
  onOpen: (e: CalendarEvent) => void;
}) {
  const style = CATEGORY_STYLES[event.category];
  const movable = isMovable(event);
  const faded = event.status === "COMPLETED" || event.status === "CANCELLED";
  return (
    <button
      type="button"
      draggable={movable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", event.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(event);
      }}
      title={`${event.title}${event.status === "CANCELLED" ? " (cancelled)" : ""}`}
      className={`flex w-full items-center gap-1 truncate rounded-md border px-1.5 py-0.5 text-left text-[11px] leading-5 transition-colors hover:brightness-95 ${
        style.chip
      } ${faded ? "opacity-60" : ""} ${movable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      {!event.allDay && (
        <span className="shrink-0 tabular-nums opacity-80">
          {fmtTime(event.category === "HOMEWORK" ? event.endUtc : event.startUtc, zone)}
        </span>
      )}
      <span className={`truncate ${event.status === "CANCELLED" ? "line-through" : ""}`}>
        {event.title}
        {event.rescheduled && event.status !== "CANCELLED" ? " ↻" : ""}
      </span>
    </button>
  );
}

export function MonthView({
  anchor,
  days,
  zone,
  today,
  byDay,
  canCreate,
  onCreate,
  onOpen,
  onShowDay,
  onDrop,
}: {
  anchor: DateTime;
  days: DateTime[];
  zone: string;
  today: string;
  byDay: Map<string, CalendarEvent[]>;
  canCreate: boolean;
  onCreate: (day: string) => void;
  onOpen: (e: CalendarEvent) => void;
  onShowDay: (day: string) => void;
  onDrop: (eventId: string, target: DropTarget) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm" role="grid" aria-label="Month">
      <div className="grid grid-cols-7 border-b border-ink/10 bg-parchment/60" role="row">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            role="columnheader"
            className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate"
          >
            <span className="sm:hidden">{d[0]}</span>
            <span className="hidden sm:inline">{d}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const key = d.toFormat("yyyy-LL-dd");
          const events = byDay.get(key) ?? [];
          const inMonth = d.month === anchor.month;
          const isToday = key === today;
          const hidden = events.length - MAX_CHIPS;
          return (
            <div
              key={key}
              role="gridcell"
              aria-label={`${d.toFormat("cccc d LLLL")}, ${events.length} ${events.length === 1 ? "event" : "events"}`}
              onClick={() => (canCreate ? onCreate(key) : onShowDay(key))}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (id) onDrop(id, { day: key });
              }}
              className={`group relative min-h-[4.5rem] cursor-pointer border-b border-r border-ink/10 p-1.5 text-left [&:nth-child(7n)]:border-r-0 sm:min-h-[7.25rem] sm:p-2 ${
                inMonth ? "bg-white hover:bg-parchment/40" : "bg-parchment/70 text-slate/70"
              } ${isToday ? "shadow-[inset_0_2px_0_0_theme(colors.ink)]" : ""}`}
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onShowDay(key);
                  }}
                  aria-label={`Open ${d.toFormat("d LLLL")} in day view`}
                  className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-xs font-medium tabular-nums ${
                    isToday
                      ? "bg-ink text-white ring-2 ring-white outline outline-1 outline-ink"
                      : inMonth
                        ? "text-ink hover:bg-parchment"
                        : "text-slate/70 hover:bg-parchment"
                  }`}
                >
                  {d.day}
                </button>
                {events.length > 0 && (
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${CATEGORY_STYLES[events[0].category].dot}`}
                  />
                )}
              </div>

              {/* Phone: dots only — tapping the day opens it. */}
              <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden" aria-hidden="true">
                {events.slice(0, 6).map((e) => (
                  <span key={e.id} className={`h-1.5 w-1.5 rounded-full ${CATEGORY_STYLES[e.category].dot}`} />
                ))}
              </div>

              <ul className="mt-1.5 hidden space-y-1 sm:block">
                {events.slice(0, MAX_CHIPS).map((e) => (
                  <li key={e.id}>
                    <EventChip event={e} zone={zone} onOpen={onOpen} />
                  </li>
                ))}
                {hidden > 0 && (
                  <li>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onShowDay(key);
                      }}
                      className="px-1 text-[11px] font-medium text-slate hover:text-ink"
                    >
                      +{hidden} more
                    </button>
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
