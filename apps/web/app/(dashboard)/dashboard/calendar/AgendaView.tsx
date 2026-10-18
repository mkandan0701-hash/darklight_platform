"use client";

import { DateTime } from "luxon";
import type { CalendarEvent } from "../../../../lib/calendar/events";
import { meetingButtonLabel } from "../../../../lib/meetingLink";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { CATEGORY_STYLES } from "./categoryStyles";
import { StatusPill, fmtTime, inZone } from "./shared";

export function AgendaView({
  events,
  zone,
  today,
  onOpen,
}: {
  events: CalendarEvent[];
  zone: string;
  today: string;
  onOpen: (e: CalendarEvent) => void;
}) {
  if (events.length === 0) {
    return (
      <EmptyState
        title="Nothing scheduled"
        description="No events in this period match your filters. Try another date range or clear the filters."
      />
    );
  }

  // Grouped by the local day each event starts on, in the displayed zone.
  const groups = new Map<string, CalendarEvent[]>();
  for (const e of [...events].sort((a, b) => a.startUtc.localeCompare(b.startUtc))) {
    const key = inZone(e.category === "HOMEWORK" ? e.endUtc : e.startUtc, zone).toFormat("yyyy-LL-dd");
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }

  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([day, list]) => {
        const d = DateTime.fromFormat(day, "yyyy-LL-dd", { zone });
        return (
          <section key={day} aria-label={d.toFormat("cccc d LLLL")}>
            <h3 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-ink">
              {d.toFormat("ccc, d LLL")}
              {day === today && <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] text-white">Today</span>}
            </h3>
            <ul className="divide-y divide-ink/5 overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm">
              {list.map((e) => {
                const style = CATEGORY_STYLES[e.category];
                const showLink = e.meetingUrl && (e.status === "UPCOMING" || e.status === "LIVE");
                return (
                  <li key={e.id} className={`border-l-4 ${style.accent}`}>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                      <div className="w-28 shrink-0 text-xs tabular-nums text-slate">
                        {e.allDay
                          ? "All day"
                          : e.category === "HOMEWORK"
                            ? `Due ${fmtTime(e.endUtc, zone)}`
                            : `${fmtTime(e.startUtc, zone)} – ${fmtTime(e.endUtc, zone)}`}
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpen(e)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span
                          className={`block truncate text-sm font-medium text-ink hover:underline ${
                            e.status === "CANCELLED" ? "line-through opacity-70" : ""
                          }`}
                        >
                          {e.title}
                        </span>
                        <span className="block truncate text-xs text-slate">
                          {[style.label, e.subtitle, e.coachNames.length ? `Coach ${e.coachNames.join(", ")}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </button>
                      <div className="flex items-center gap-2">
                        {e.rescheduled && e.status !== "CANCELLED" && (
                          <span className="rounded-full bg-gold-light px-2 py-0.5 text-[11px] font-medium text-ink">
                            Rescheduled
                          </span>
                        )}
                        <StatusPill status={e.status} />
                        {showLink && (
                          <a
                            href={e.meetingUrl!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg border border-ink/15 px-2.5 py-1 text-xs font-medium text-board hover:bg-board-light"
                          >
                            {meetingButtonLabel(e.meetingUrl!)}
                          </a>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
