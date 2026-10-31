import { DateTime } from "luxon";
import { shiftLikeSibling, siblingShift } from "./recurrence";

// What "move this and following" means, as data. The action loads the rows,
// this decides where each one goes, the repository writes the result. Kept
// pure so the DST and day-shift behaviour is tested without a database.

export type EditScope = "THIS" | "FOLLOWING" | "ALL";

export type SeriesSession = {
  id: string;
  scheduledAtUtc: Date;
  durationMins: number;
  status: string;
};

export type PlannedMove = {
  id: string;
  expectedVersion?: Date;
  fromStartUtc: Date;
  fromDurationMins: number;
  toStartUtc: Date;
  toDurationMins: number;
  occurrenceDate: string;
};

export type SeriesPlan = {
  moves: PlannedMove[];
  /** Already-cancelled siblings, moved too so a cancelled week stays cancelled. */
  cancelled: { id: string; toStartUtc: Date; occurrenceDate: string }[];
  /** The weekly template the moved part now follows (for slot series). */
  template: { dayOfWeek: number; localTime: string; startsOn: string };
};

/**
 * `anchor` is the occurrence the user edited; `siblings` are the other
 * occurrences in scope (any order, may include the anchor). The anchor goes
 * exactly where the user put it; every sibling moves by the same number of
 * local days to the same local clock time, read in the series' own `zone`.
 */
export function planSeriesMove(input: {
  anchor: SeriesSession & { version: Date };
  siblings: SeriesSession[];
  toStartUtc: Date;
  toDurationMins: number;
  zone: string;
}): SeriesPlan {
  const { anchor, zone } = input;
  const shift = siblingShift(anchor.scheduledAtUtc, input.toStartUtc, zone);
  const local = (d: Date) => DateTime.fromJSDate(d, { zone });

  const moves: PlannedMove[] = [
    {
      id: anchor.id,
      expectedVersion: anchor.version,
      fromStartUtc: anchor.scheduledAtUtc,
      fromDurationMins: anchor.durationMins,
      toStartUtc: input.toStartUtc,
      toDurationMins: input.toDurationMins,
      occurrenceDate: local(input.toStartUtc).toFormat("yyyy-LL-dd"),
    },
  ];
  const cancelled: SeriesPlan["cancelled"] = [];

  for (const s of input.siblings) {
    if (s.id === anchor.id) continue;
    const to = shiftLikeSibling(s.scheduledAtUtc, zone, shift);
    const target = { toStartUtc: to.toUTC().toJSDate(), occurrenceDate: to.toFormat("yyyy-LL-dd") };
    if (s.status === "CANCELLED") {
      cancelled.push({ id: s.id, ...target });
    } else {
      moves.push({
        id: s.id,
        fromStartUtc: s.scheduledAtUtc,
        fromDurationMins: s.durationMins,
        toDurationMins: input.toDurationMins,
        ...target,
      });
    }
  }
  moves.sort((a, b) => a.toStartUtc.getTime() - b.toStartUtc.getTime());

  const anchorLocal = local(input.toStartUtc);
  const earliest = [...moves.map((m) => m.occurrenceDate), ...cancelled.map((c) => c.occurrenceDate)].sort()[0];
  return {
    moves,
    cancelled,
    template: {
      dayOfWeek: anchorLocal.weekday,
      localTime: anchorLocal.toFormat("HH:mm"),
      startsOn: earliest ?? anchorLocal.toFormat("yyyy-LL-dd"),
    },
  };
}

/** Which siblings a scope reaches: from the anchor on, or from now on. */
export function scopeStart(scope: Exclude<EditScope, "THIS">, anchorStartUtc: Date, now: Date): Date {
  return scope === "FOLLOWING" ? anchorStartUtc : new Date(Math.min(now.getTime(), anchorStartUtc.getTime()));
}
