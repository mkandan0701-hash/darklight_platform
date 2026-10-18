import { DateTime } from "luxon";

// Calendar boundary math in an explicit timezone.
//
// Dashboard periods are a *business* question, so they are computed in the
// academy's zone (Tenant.timezone), not the viewer's — otherwise an admin in
// New York and one in Bengaluru disagree about what "this week" contains while
// looking at the same academy. Displayed times still convert to the viewer's
// zone via lib/time.ts, per claude.md §3.5.
//
// Nothing here existed before: lib/time.ts formats instants, it does not bound
// ranges, and the repository layer had exactly one range query (demo bookings).

/** A half-open interval [start, end) in UTC. */
export interface Period {
  start: Date;
  end: Date;
}

export type PeriodUnit = "day" | "week" | "month" | "year";

function zoned(now: Date, zone: string): DateTime {
  const dt = DateTime.fromJSDate(now, { zone: "utc" }).setZone(zone);
  if (!dt.isValid) {
    throw new Error(`Invalid timezone: ${zone}`);
  }
  return dt;
}

function toPeriod(start: DateTime, unit: PeriodUnit): Period {
  // plus({ [unit]: 1 }) rather than a fixed number of hours: a week containing
  // a DST transition is 167 or 169 hours long, and a month is never a constant.
  return {
    start: start.toUTC().toJSDate(),
    end: start.plus({ [unit]: 1 }).toUTC().toJSDate(),
  };
}

/**
 * The calendar period containing `now`, in `zone`.
 *
 * Weeks start Monday — luxon's ISO default, and the convention
 * ClassroomScheduleSlot.dayOfWeek already uses (1=Mon..7=Sun).
 */
export function periodBounds(unit: PeriodUnit, zone: string, now: Date = new Date()): Period {
  return toPeriod(zoned(now, zone).startOf(unit), unit);
}

/** The same calendar period, one step earlier — for week-over-week deltas. */
export function previousPeriodBounds(
  unit: PeriodUnit,
  zone: string,
  now: Date = new Date()
): Period {
  return toPeriod(zoned(now, zone).startOf(unit).minus({ [unit]: 1 }), unit);
}

/**
 * A rolling window ending now: "the last 30 days", not "this month".
 *
 * Counted back in local days so the window starts at local midnight, which is
 * what makes two runs on the same day agree.
 */
export function lastNDays(n: number, zone: string, now: Date = new Date()): Period {
  const today = zoned(now, zone).startOf("day");
  return {
    start: today.minus({ days: n - 1 }).toUTC().toJSDate(),
    end: today.plus({ days: 1 }).toUTC().toJSDate(),
  };
}

/** The last `n` calendar weeks, oldest first, with the current week last. */
export function lastNWeeks(n: number, zone: string, now: Date = new Date()): Period[] {
  const thisWeek = zoned(now, zone).startOf("week");
  return Array.from({ length: n }, (_, i) =>
    toPeriod(thisWeek.minus({ weeks: n - 1 - i }), "week")
  );
}

/** "yyyy-LL-dd" for the local day an instant falls in — the bucket key. */
export function localDayKey(date: Date, zone: string): string {
  return zoned(date, zone).toFormat("yyyy-LL-dd");
}

/** "yyyy-LL" for the local month an instant falls in. */
export function localMonthKey(date: Date, zone: string): string {
  return zoned(date, zone).toFormat("yyyy-LL");
}

/**
 * Every local day key in a period, in order.
 *
 * Walks in local days rather than adding 24h at a time, so a week spanning a
 * DST transition still yields exactly seven — adding hours yields six or eight
 * and silently drops or duplicates a column on the chart.
 */
export function daysInRange(period: Period, zone: string): string[] {
  const keys: string[] = [];
  let cursor = zoned(period.start, zone).startOf("day");
  const end = zoned(period.end, zone);
  while (cursor < end) {
    keys.push(cursor.toFormat("yyyy-LL-dd"));
    cursor = cursor.plus({ days: 1 });
  }
  return keys;
}

/** Every local month key in a period, in order. */
export function monthsInRange(period: Period, zone: string): string[] {
  const keys: string[] = [];
  let cursor = zoned(period.start, zone).startOf("month");
  const end = zoned(period.end, zone);
  while (cursor < end) {
    keys.push(cursor.toFormat("yyyy-LL"));
    cursor = cursor.plus({ months: 1 });
  }
  return keys;
}

/** Short axis label for a day key: "Mon", "Tue"… */
export function dayLabel(dayKey: string, zone: string): string {
  return DateTime.fromFormat(dayKey, "yyyy-LL-dd", { zone }).toFormat("ccc");
}

/** Short axis label for a day key including the date: "14 Oct". */
export function dayDateLabel(dayKey: string, zone: string): string {
  return DateTime.fromFormat(dayKey, "yyyy-LL-dd", { zone }).toFormat("d LLL");
}

/** Short axis label for a month key: "Jan", "Feb"… */
export function monthLabel(monthKey: string, zone: string): string {
  return DateTime.fromFormat(monthKey, "yyyy-LL", { zone }).toFormat("LLL");
}
