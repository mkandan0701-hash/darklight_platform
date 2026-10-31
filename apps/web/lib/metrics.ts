import { DateTime } from "luxon";
import { attendanceRate } from "./attendance";
import {
  dayDateLabel,
  dayLabel,
  daysInRange,
  localDayKey,
  localMonthKey,
  monthLabel,
  monthsInRange,
  type Period,
} from "./periods";

// Pure folding for the admin dashboard. Kept out of the repository because
// tenantScope guards `count` and `findMany` but NOT `groupBy`/`aggregate`
// (packages/db/src/tenantScope.ts) — a grouped query would silently escape
// tenant isolation, so every bucket is counted here in JS instead.

/**
 * One plotted point.
 *
 * `null` means "no data for this bucket", which is not the same as zero and
 * must not be drawn as one: a week in which nobody took a register is not a
 * week in which nobody turned up. The chart breaks its line across a null.
 * A genuine zero — nobody registered on Tuesday — stays 0.
 */
export interface ChartPoint {
  label: string;
  value: number | null;
}

/** One timestamp per occurrence, bucketed into the local days of `period`. */
export function bucketByDay(
  timestamps: Date[],
  period: Period,
  zone: string,
  labelStyle: "weekday" | "date" = "weekday"
): ChartPoint[] {
  const counts = new Map<string, number>();
  for (const t of timestamps) {
    const key = localDayKey(t, zone);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  // Driven by the calendar, not by the data: a day nobody registered on is a
  // zero on the chart, not a missing tick that shifts every later point left.
  return daysInRange(period, zone).map((key) => ({
    label: labelStyle === "weekday" ? dayLabel(key, zone) : dayDateLabel(key, zone),
    value: counts.get(key) ?? 0,
  }));
}

/** The same, bucketed into the local months of `period`. */
export function bucketByMonth(timestamps: Date[], period: Period, zone: string): ChartPoint[] {
  const counts = new Map<string, number>();
  for (const t of timestamps) {
    const key = localMonthKey(t, zone);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return monthsInRange(period, zone).map((key) => ({
    label: monthLabel(key, zone),
    value: counts.get(key) ?? 0,
  }));
}

export interface AttendanceSplit {
  present: number;
  absent: number;
  /** The denominator: rows a coach actually marked. */
  marked: number;
  /** Percent present, or null when nothing has been marked. */
  presentRate: number | null;
  /** Percent marked absent — the exact complement of presentRate. */
  noShowRate: number | null;
}

/**
 * Splits marked attendance rows into present/absent rates.
 *
 * The denominator is rows that exist, never sessions that were scheduled: an
 * unmarked class is missing data, not an absence — the rule lib/attendance.ts
 * already encodes and the reason both rates are null rather than 0%/100% when
 * a coach hasn't marked anything yet. Reporting a brand-new academy as "100%
 * no-show" is the specific failure this guards.
 *
 * No-show is the complement of present because nothing in the schema records
 * whether a session actually ran — LiveSession has no startedAt/endedAt — so
 * there is no larger, honest denominator available.
 */
export function attendanceSplit(records: readonly { present: boolean }[]): AttendanceSplit {
  let present = 0;
  for (const r of records) {
    if (r.present) present++;
  }
  const marked = records.length;
  const absent = marked - present;
  return {
    present,
    absent,
    marked,
    presentRate: attendanceRate(present, marked),
    noShowRate: attendanceRate(absent, marked),
  };
}

/** "67%", or "—" when there is nothing to divide by. */
export function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${rate}%`;
}

/** Mean, rounded — or null for an empty set, which has no mean. */
export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

/** "2 hours ago", "3 days ago" — for the activity feed. */
export function relativeTime(date: Date, now: Date = new Date()): string {
  return (
    DateTime.fromJSDate(date, { zone: "utc" }).toRelative({
      base: DateTime.fromJSDate(now, { zone: "utc" }),
    }) ?? ""
  );
}

export type DeltaTone = "up" | "down" | "flat";

export interface Delta {
  text: string;
  tone: DeltaTone;
}

/**
 * Growth inside a window: "+3 this month".
 *
 * Cannot go negative — a student created last month stays created — so this is
 * a count, not a difference. Zero reads neutral rather than green, because
 * "+0" is not good news.
 */
export function formatGrowth(count: number, suffix: string): Delta {
  return { text: `+${count} ${suffix}`, tone: count > 0 ? "up" : "flat" };
}

/**
 * This period against the last one: "+2 vs last week", "-1 vs last week".
 *
 * A real difference, so it can fall. Saying "+0" when a quiet week follows a
 * busy one would read as steady when it is not, hence the explicit no-change
 * wording.
 */
export function formatComparison(current: number, previous: number, suffix: string): Delta {
  const diff = current - previous;
  if (diff === 0) return { text: `No change ${suffix}`, tone: "flat" };
  const sign = diff > 0 ? "+" : "−";
  return { text: `${sign}${Math.abs(diff)} ${suffix}`, tone: diff > 0 ? "up" : "down" };
}
