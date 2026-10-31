import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { planSeriesMove, scopeStart } from "./seriesEdit";

const at = (iso: string, zone: string) => DateTime.fromISO(iso, { zone }).toUTC().toJSDate();
const local = (d: Date, zone: string) => DateTime.fromJSDate(d, { zone }).toFormat("ccc yyyy-LL-dd HH:mm");

describe("planSeriesMove", () => {
  const zone = "America/New_York";
  const sat = (date: string) => ({
    id: `s_${date}`,
    scheduledAtUtc: at(`${date}T10:00`, zone),
    durationMins: 60,
    status: "SCHEDULED",
  });

  it("moves every following class by the same local shift, across the DST change", () => {
    const anchor = { ...sat("2026-10-24"), version: new Date("2026-10-01T00:00:00Z") };
    const plan = planSeriesMove({
      anchor,
      siblings: [sat("2026-10-24"), sat("2026-10-31"), sat("2026-11-07")],
      // Saturday 10:00 -> Sunday 11:30
      toStartUtc: at("2026-10-25T11:30", zone),
      toDurationMins: 90,
      zone,
    });
    expect(plan.moves.map((m) => local(m.toStartUtc, zone))).toEqual([
      "Sun 2026-10-25 11:30",
      "Sun 2026-11-01 11:30", // the day clocks fall back — still 11:30 local
      "Sun 2026-11-08 11:30",
    ]);
    expect(plan.moves.every((m) => m.toDurationMins === 90)).toBe(true);
    // Only the edited class carries the optimistic-concurrency token.
    expect(plan.moves.filter((m) => m.expectedVersion)).toHaveLength(1);
    expect(plan.template).toEqual({ dayOfWeek: 7, localTime: "11:30", startsOn: "2026-10-25" });
  });

  it("carries already-cancelled weeks along without un-cancelling them", () => {
    const anchor = { ...sat("2026-10-24"), version: new Date() };
    const plan = planSeriesMove({
      anchor,
      siblings: [{ ...sat("2026-10-31"), status: "CANCELLED" }],
      toStartUtc: at("2026-10-24T12:00", zone),
      toDurationMins: 60,
      zone,
    });
    expect(plan.moves.map((m) => m.id)).toEqual(["s_2026-10-24"]);
    expect(plan.cancelled).toEqual([
      { id: "s_2026-10-31", toStartUtc: at("2026-10-31T12:00", zone), occurrenceDate: "2026-10-31" },
    ]);
  });

  it("moves just the anchor when there are no siblings", () => {
    const anchor = { ...sat("2026-10-24"), version: new Date() };
    const plan = planSeriesMove({ anchor, siblings: [], toStartUtc: at("2026-10-27T18:00", zone), toDurationMins: 60, zone });
    expect(plan.moves).toHaveLength(1);
    expect(plan.moves[0].occurrenceDate).toBe("2026-10-27");
  });
});

describe("scopeStart", () => {
  it("reads 'following' from the edited class and 'all' from now", () => {
    const anchor = new Date("2026-11-07T15:00:00Z");
    const now = new Date("2026-10-18T00:00:00Z");
    expect(scopeStart("FOLLOWING", anchor, now)).toEqual(anchor);
    expect(scopeStart("ALL", anchor, now)).toEqual(now);
  });
});
