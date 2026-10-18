import { DateTime } from "luxon";

// Finite recurrence for classes created from the calendar ("every Tue and Thu
// for 10 weeks"). Open-ended weekly repeats don't come through here — they
// become a ClassroomScheduleSlot, which the nightly materializer extends
// forever (packages/shared/src/scheduleSlots.ts).
//
// Same DST rule as the slot materializer: every occurrence is built from its
// own local date in the event's zone and converted to UTC individually. Adding
// 7×24h to a UTC instant would move a New York class by an hour at the
// March and November transitions.

export type RecurrenceEnd =
  | { kind: "COUNT"; count: number }
  | { kind: "UNTIL"; until: string }; // yyyy-LL-dd in the event's zone, inclusive

export type Recurrence =
  | { freq: "NONE" }
  | { freq: "DAILY"; interval: number; end: RecurrenceEnd }
  // weekdays: luxon convention, 1=Mon..7=Sun
  | { freq: "WEEKLY"; interval: number; weekdays: number[]; end: RecurrenceEnd };

/** Upper bound on rows one save can create — two years of a weekly class. */
export const MAX_OCCURRENCES = 104;

export type Occurrence = {
  /** The calendar date this occurrence is for, in the event's zone. */
  occurrenceDate: string;
  startUtc: Date;
};

export class RecurrenceError extends Error {}

/**
 * Expands a rule from a local start ("yyyy-LL-ddTHH:mm" in `zone`) into UTC
 * instants. The start itself is the first occurrence when it matches the
 * rule; for a weekly rule whose weekdays exclude the start's weekday, the
 * first occurrence is the next matching day (the way every calendar app
 * behaves when you pick "Tue/Thu" on a Monday).
 */
export function expandRecurrence(startLocal: string, zone: string, rule: Recurrence): Occurrence[] {
  const start = DateTime.fromISO(startLocal, { zone });
  if (!start.isValid) {
    throw new RecurrenceError(`Invalid start date/time: ${start.invalidReason}`);
  }
  const at = (d: DateTime): Occurrence => ({
    occurrenceDate: d.toFormat("yyyy-LL-dd"),
    startUtc: d.toUTC().toJSDate(),
  });

  if (rule.freq === "NONE") return [at(start)];

  const interval = Math.trunc(rule.interval);
  if (!Number.isFinite(interval) || interval < 1 || interval > 52) {
    throw new RecurrenceError("Repeat interval must be between 1 and 52");
  }

  const { isDone, accept } = endCondition(rule.end, zone);
  const time = { hour: start.hour, minute: start.minute, second: 0, millisecond: 0 };
  const out: Occurrence[] = [];

  if (rule.freq === "DAILY") {
    for (let i = 0; out.length < MAX_OCCURRENCES; i += interval) {
      const local = start.plus({ days: i }).set(time);
      if (!accept(local)) break;
      out.push(at(local));
      if (isDone(out.length)) break;
    }
    return out;
  }

  const weekdays = [...new Set(rule.weekdays.map(Math.trunc))]
    .filter((d) => d >= 1 && d <= 7)
    .sort((a, b) => a - b);
  if (weekdays.length === 0) weekdays.push(start.weekday);

  const firstWeek = start.startOf("week");
  // Bounded by MAX_OCCURRENCES and by the end condition; the week cap is a
  // backstop against an UNTIL far in the future with a sparse rule.
  for (let w = 0; w < MAX_OCCURRENCES * 52 && out.length < MAX_OCCURRENCES; w += interval) {
    const week = firstWeek.plus({ weeks: w });
    for (const weekday of weekdays) {
      const local = week.plus({ days: weekday - 1 }).set(time);
      if (local < start) continue;
      if (!accept(local)) return out;
      out.push(at(local));
      if (isDone(out.length) || out.length >= MAX_OCCURRENCES) return out;
    }
  }
  return out;
}

function endCondition(end: RecurrenceEnd, zone: string) {
  if (end.kind === "COUNT") {
    const count = Math.trunc(end.count);
    if (!Number.isFinite(count) || count < 1 || count > MAX_OCCURRENCES) {
      throw new RecurrenceError(`Number of classes must be between 1 and ${MAX_OCCURRENCES}`);
    }
    return { isDone: (n: number) => n >= count, accept: () => true };
  }
  const until = DateTime.fromFormat(end.until, "yyyy-LL-dd", { zone });
  if (!until.isValid) throw new RecurrenceError("Invalid end date");
  const lastInstant = until.endOf("day");
  return { isDone: () => false, accept: (d: DateTime) => d <= lastInstant };
}

/**
 * Moves one occurrence the way its sibling was moved: by the same number of
 * local calendar days, to the same new local clock time. Used for "this and
 * following" / "all upcoming" edits, so a series moved from Saturday 10:00 to
 * Sunday 11:30 IST lands every occurrence on its own Sunday 11:30 — not on a
 * fixed UTC offset that DST would skew for a US-zone series.
 */
export function shiftLikeSibling(
  occurrenceUtc: Date,
  zone: string,
  shift: { dayDelta: number; hour: number; minute: number }
): DateTime {
  return DateTime.fromJSDate(occurrenceUtc, { zone })
    .plus({ days: shift.dayDelta })
    .set({ hour: shift.hour, minute: shift.minute, second: 0, millisecond: 0 });
}

/** The shift that took `fromUtc` to `toUtc`, read as local days + clock in `zone`. */
export function siblingShift(fromUtc: Date, toUtc: Date, zone: string) {
  const from = DateTime.fromJSDate(fromUtc, { zone }).startOf("day");
  const to = DateTime.fromJSDate(toUtc, { zone });
  const dayDelta = Math.round(to.startOf("day").diff(from, "days").days);
  return { dayDelta, hour: to.hour, minute: to.minute };
}
