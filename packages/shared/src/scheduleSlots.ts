import { DateTime } from "luxon";

// Recurrence math for weekend-first classroom templates. Shared between
// apps/web (immediate top-up when a coach adds a slot) and apps/api (nightly
// materialization sweep) so both sides compute identical occurrences.

export interface ScheduleSlotLike {
  dayOfWeek: number; // luxon convention: 1=Mon..7=Sun
  localTime: string; // "HH:mm", interpreted in `timezone`
  timezone: string;
  // "yyyy-LL-dd" in `timezone`: no occurrence before this date. Null/absent
  // means no lower bound.
  startsOn?: string | null;
}

export interface ScheduleOccurrence {
  occurrenceDate: string; // "yyyy-LL-dd" in the slot's own timezone
  scheduledAtUtc: Date;
}

const DEFAULT_HORIZON_WEEKS = 8;

// Never store a recurring slot as a single precomputed UTC instant plus
// `+7 days` per occurrence — a zone's UTC offset changes across its own DST
// boundary (e.g. America/New_York is UTC-5 in January, UTC-4 in July), so
// that approach silently drifts the wall-clock time by an hour after the
// transition. Instead, each occurrence is built from its own calendar date in
// the slot's zone and converted to UTC individually, so it resolves its own
// offset every time.
export function computeUpcomingOccurrencesUtc(
  slot: ScheduleSlotLike,
  opts: { now?: Date; horizonWeeks?: number } = {}
): ScheduleOccurrence[] {
  const horizonWeeks = opts.horizonWeeks ?? DEFAULT_HORIZON_WEEKS;
  const [hourStr, minuteStr] = slot.localTime.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);

  const now = DateTime.fromJSDate(opts.now ?? new Date(), { zone: slot.timezone });
  if (!now.isValid) {
    throw new Error(`Invalid timezone: ${slot.timezone}`);
  }

  let first = now.set({ hour, minute, second: 0, millisecond: 0 });
  first = first.plus({ days: (slot.dayOfWeek - first.weekday + 7) % 7 });
  if (first < now) {
    first = first.plus({ weeks: 1 });
  }
  // Compared as strings: both are zero-padded yyyy-LL-dd in the slot's zone,
  // so lexical order is calendar order.
  if (slot.startsOn) {
    while (first.toFormat("yyyy-LL-dd") < slot.startsOn) {
      first = first.plus({ weeks: 1 });
    }
  }

  const occurrences: ScheduleOccurrence[] = [];
  for (let i = 0; i < horizonWeeks; i++) {
    const local = first.plus({ weeks: i });
    occurrences.push({
      occurrenceDate: local.toFormat("yyyy-LL-dd"),
      scheduledAtUtc: local.toUTC().toJSDate(),
    });
  }
  return occurrences;
}
