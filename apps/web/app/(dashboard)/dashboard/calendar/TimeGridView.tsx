"use client";

import { useEffect, useRef, useState } from "react";
import { DateTime } from "luxon";
import { layoutDay, type CalendarEvent } from "../../../../lib/calendar/events";
import { CATEGORY_STYLES } from "./categoryStyles";
import { EventChip, isMovable, type DropTarget } from "./MonthView";
import { fmtTime } from "./shared";

// Week and day views: a 24-hour grid with events placed by their local clock
// time in the displayed zone. Overlapping events share the column width
// (layoutDay in lib/calendar/events.ts decides the columns).

const HOUR_PX = 48;
const PX_PER_MIN = HOUR_PX / 60;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

function snap(minutes: number, step: number) {
  return Math.max(0, Math.min(24 * 60 - step, Math.round(minutes / step) * step));
}

export function TimeGridView({
  days,
  zone,
  today,
  byDay,
  canCreate,
  onCreate,
  onOpen,
  onDrop,
}: {
  days: DateTime[];
  zone: string;
  today: string;
  byDay: Map<string, CalendarEvent[]>;
  canCreate: boolean;
  onCreate: (startLocal: string) => void;
  onOpen: (e: CalendarEvent) => void;
  onDrop: (eventId: string, target: DropTarget) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [nowMins, setNowMins] = useState<number | null>(null);

  // Open on the working day (or the first event) rather than at midnight.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const firstTimed = days
      .flatMap((d) => byDay.get(d.toFormat("yyyy-LL-dd")) ?? [])
      .filter((e) => !e.allDay)
      .map((e) => DateTime.fromISO(e.startUtc, { zone: "utc" }).setZone(zone).hour);
    const hour = Math.max(0, Math.min(firstTimed.length ? Math.min(...firstTimed) : 8, 8) - 1);
    el.scrollTop = hour * HOUR_PX;
    // Only on first render of a range; re-scrolling on every data refresh
    // would yank the grid out from under someone mid-drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0]?.toISODate()]);

  useEffect(() => {
    const tick = () => {
      const n = DateTime.now().setZone(zone);
      setNowMins(n.hour * 60 + n.minute);
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [zone]);

  const gridCols = { gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` };
  const allDayByDay = days.map((d) => (byDay.get(d.toFormat("yyyy-LL-dd")) ?? []).filter((e) => e.allDay));
  const hasAllDay = allDayByDay.some((list) => list.length > 0);

  return (
    <div className="overflow-x-auto rounded-xl border border-ink/10 bg-white shadow-sm">
      <div className={days.length > 1 ? "min-w-[44rem]" : ""}>
        {/* Day headers */}
        <div className="grid border-b border-ink/10 bg-parchment/60" style={gridCols}>
          <div />
          {days.map((d) => {
            const key = d.toFormat("yyyy-LL-dd");
            return (
              <div key={key} className="border-l border-ink/10 py-2 text-center">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate">{d.toFormat("ccc")}</div>
                <div
                  className={`mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium ${
                    key === today ? "bg-ink text-white" : "text-ink"
                  }`}
                >
                  {d.day}
                </div>
              </div>
            );
          })}
        </div>

        {hasAllDay && (
          <div className="grid border-b border-ink/10" style={gridCols}>
            <div className="py-1.5 pr-2 text-right text-[10px] uppercase tracking-wide text-slate">All day</div>
            {allDayByDay.map((list, i) => (
              <div key={i} className="space-y-1 border-l border-ink/10 p-1">
                {list.map((e) => (
                  <EventChip key={e.id} event={e} zone={zone} onOpen={onOpen} />
                ))}
              </div>
            ))}
          </div>
        )}

        <div ref={scrollRef} className="max-h-[38rem] overflow-y-auto">
          <div className="relative grid" style={{ ...gridCols, height: 24 * HOUR_PX }}>
            {/* Hour labels */}
            <div className="relative">
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-slate"
                  style={{ top: h * HOUR_PX }}
                >
                  {h === 0 ? "" : DateTime.fromObject({ hour: h }).toFormat("h a")}
                </div>
              ))}
            </div>

            {days.map((d) => {
              const key = d.toFormat("yyyy-LL-dd");
              const positioned = layoutDay(byDay.get(key) ?? [], d);
              const minutesAt = (clientY: number, el: HTMLElement) =>
                (clientY - el.getBoundingClientRect().top) / PX_PER_MIN;
              return (
                <div
                  key={key}
                  className={`relative border-l border-ink/10 ${canCreate ? "cursor-pointer" : ""}`}
                  onClick={(e) => {
                    if (!canCreate) return;
                    const m = snap(minutesAt(e.clientY, e.currentTarget), 30);
                    onCreate(d.set({ hour: Math.floor(m / 60), minute: m % 60 }).toFormat("yyyy-LL-dd'T'HH:mm"));
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("text/plain");
                    if (id) onDrop(id, { day: key, minutes: snap(minutesAt(e.clientY, e.currentTarget), 15) });
                  }}
                >
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="pointer-events-none absolute inset-x-0 border-t border-ink/5"
                      style={{ top: h * HOUR_PX }}
                    />
                  ))}

                  {key === today && nowMins !== null && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-brick"
                      style={{ top: nowMins * PX_PER_MIN }}
                      aria-hidden="true"
                    >
                      <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-brick" />
                    </div>
                  )}

                  {positioned.map(({ event, top, height, column, columns }) => {
                    const style = CATEGORY_STYLES[event.category];
                    const faded = event.status === "COMPLETED" || event.status === "CANCELLED";
                    const movable = isMovable(event);
                    return (
                      <button
                        key={event.id}
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
                        className={`absolute overflow-hidden rounded-md border border-l-4 px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm ${
                          style.chip
                        } ${style.accent} ${faded ? "opacity-60" : ""} ${movable ? "cursor-grab" : ""}`}
                        style={{
                          top: top * PX_PER_MIN,
                          height: Math.max(height * PX_PER_MIN, 18),
                          left: `calc(${(column / columns) * 100}% + 2px)`,
                          width: `calc(${100 / columns}% - 4px)`,
                        }}
                      >
                        <span className={`block truncate font-medium ${event.status === "CANCELLED" ? "line-through" : ""}`}>
                          {event.title}
                        </span>
                        {height >= 40 && (
                          <span className="block truncate tabular-nums opacity-80">
                            {event.category === "HOMEWORK"
                              ? `Due ${fmtTime(event.endUtc, zone)}`
                              : `${fmtTime(event.startUtc, zone)} – ${fmtTime(event.endUtc, zone)}`}
                          </span>
                        )}
                        {height >= 64 && event.coachNames.length > 0 && (
                          <span className="block truncate opacity-70">{event.coachNames.join(", ")}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
