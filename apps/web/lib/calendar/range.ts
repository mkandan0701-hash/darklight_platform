import { DateTime, IANAZone } from "luxon";

// Which slice of time a calendar view covers, computed in the *viewer's*
// zone. A month grid in New Jersey and one in Bengaluru start at different
// UTC instants, and both must start at local midnight on a Monday — so every
// boundary here is built as a local date first and converted to UTC last,
// the same order of operations zonedLocalToUtc uses (lib/time.ts).

export const CALENDAR_VIEWS = ["month", "week", "day", "agenda"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

/** The zone used when neither the viewer nor the academy has a valid one. */
export const FALLBACK_ZONE = "Asia/Kolkata";

/** How far ahead the agenda list reads from its anchor date. */
export const AGENDA_DAYS = 30;

const DATE_FORMAT = "yyyy-LL-dd";

export function isValidZone(zone: string | null | undefined): zone is string {
  return !!zone && IANAZone.isValidZone(zone);
}

/** First valid zone in preference order, falling back to IST. */
export function resolveZone(...candidates: (string | null | undefined)[]): string {
  return candidates.find(isValidZone) ?? FALLBACK_ZONE;
}

/**
 * The anchor date a view is centred on, as local midnight in `zone`.
 * Anything unparseable means "today" rather than an error: this comes from
 * the URL, and a mangled link should still open a calendar.
 */
export function parseAnchor(date: string | null | undefined, zone: string, now = new Date()): DateTime {
  if (date) {
    const parsed = DateTime.fromFormat(date, DATE_FORMAT, { zone });
    if (parsed.isValid) return parsed.startOf("day");
  }
  return DateTime.fromJSDate(now, { zone }).startOf("day");
}

export function formatAnchor(anchor: DateTime): string {
  return anchor.toFormat(DATE_FORMAT);
}

/**
 * [start, end) of what a view displays, both local midnights in the anchor's
 * zone. luxon's startOf("week") is ISO, i.e. Monday — matching the grid.
 * Day arithmetic is calendar arithmetic, so a range that crosses a DST change
 * still ends at local midnight (a 23- or 25-hour day is still one day).
 */
export function viewRange(view: CalendarView, anchor: DateTime): { start: DateTime; end: DateTime } {
  switch (view) {
    case "month": {
      const start = anchor.startOf("month").startOf("week");
      return { start, end: start.plus({ days: 42 }) };
    }
    case "week": {
      const start = anchor.startOf("week");
      return { start, end: start.plus({ days: 7 }) };
    }
    case "day":
      return { start: anchor.startOf("day"), end: anchor.startOf("day").plus({ days: 1 }) };
    case "agenda":
      return { start: anchor.startOf("day"), end: anchor.startOf("day").plus({ days: AGENDA_DAYS }) };
  }
}

/** The anchor one step back or forward — a month, a week, a day, or an agenda page. */
export function shiftAnchor(view: CalendarView, anchor: DateTime, direction: -1 | 1): DateTime {
  switch (view) {
    case "month":
      // From the 1st, so Jan 31 -> Feb doesn't overflow into March.
      return anchor.startOf("month").plus({ months: direction });
    case "week":
      return anchor.plus({ weeks: direction });
    case "day":
      return anchor.plus({ days: direction });
    case "agenda":
      return anchor.plus({ days: AGENDA_DAYS * direction });
  }
}

/** Every day in [start, end), as local midnights. */
export function daysInRange(start: DateTime, end: DateTime): DateTime[] {
  const days: DateTime[] = [];
  for (let d = start.startOf("day"); d < end; d = d.plus({ days: 1 })) days.push(d);
  return days;
}

export function rangeLabel(view: CalendarView, anchor: DateTime): string {
  switch (view) {
    case "month":
      return anchor.toFormat("LLLL yyyy");
    case "week": {
      const { start, end } = viewRange("week", anchor);
      const last = end.minus({ days: 1 });
      return start.month === last.month
        ? `${start.toFormat("d")} – ${last.toFormat("d LLL yyyy")}`
        : `${start.toFormat("d LLL")} – ${last.toFormat("d LLL yyyy")}`;
    }
    case "day":
      return anchor.toFormat("cccc, d LLLL yyyy");
    case "agenda": {
      const { end } = viewRange("agenda", anchor);
      return `${anchor.toFormat("d LLL")} – ${end.minus({ days: 1 }).toFormat("d LLL yyyy")}`;
    }
  }
}
