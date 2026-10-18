import { describe, expect, it } from "vitest";
import {
  attendanceSplit,
  bucketByDay,
  bucketByMonth,
  formatComparison,
  formatGrowth,
  formatRate,
  mean,
  relativeTime,
} from "./metrics";
import { periodBounds } from "./periods";

const IST = "Asia/Kolkata";
const wednesday = new Date("2026-10-14T06:30:00.000Z");

describe("bucketByDay", () => {
  it("emits one point per calendar day, including days with nothing", () => {
    const week = periodBounds("week", IST, wednesday);
    const points = bucketByDay([new Date("2026-10-14T06:00:00.000Z")], week, IST);
    expect(points).toHaveLength(7);
    expect(points.map((p) => p.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(points.map((p) => p.value)).toEqual([0, 0, 1, 0, 0, 0, 0]);
  });

  // Without this the chart silently shifts: a quiet Tuesday would vanish and
  // Wednesday's bar would slide into its place.
  it("keeps empty days as zeros rather than dropping the tick", () => {
    const week = periodBounds("week", IST, wednesday);
    expect(bucketByDay([], week, IST).every((p) => p.value === 0)).toBe(true);
    expect(bucketByDay([], week, IST)).toHaveLength(7);
  });

  // 19:00 UTC is already the next day in IST. Bucketing on the UTC date would
  // credit an evening signup to the wrong day.
  it("buckets a late-evening UTC instant into the right local day", () => {
    const week = periodBounds("week", IST, wednesday);
    const points = bucketByDay([new Date("2026-10-14T19:00:00.000Z")], week, IST);
    expect(points[2].value).toBe(0); // Wednesday
    expect(points[3].value).toBe(1); // Thursday, locally
  });

  it("counts several on the same day together", () => {
    const week = periodBounds("week", IST, wednesday);
    const sameDay = [
      new Date("2026-10-14T03:00:00.000Z"),
      new Date("2026-10-14T06:00:00.000Z"),
      new Date("2026-10-14T09:00:00.000Z"),
    ];
    expect(bucketByDay(sameDay, week, IST)[2].value).toBe(3);
  });
});

describe("bucketByMonth", () => {
  it("emits twelve points for a year", () => {
    const year = periodBounds("year", IST, wednesday);
    const points = bucketByMonth([new Date("2026-03-10T06:00:00.000Z")], year, IST);
    expect(points).toHaveLength(12);
    expect(points[0].label).toBe("Jan");
    expect(points[2].value).toBe(1);
    // bucketByMonth counts, so every bucket is a real number — a null here
    // would mean "no data", which a count can never produce.
    expect(points.reduce((sum, p) => sum + (p.value ?? 0), 0)).toBe(1);
    expect(points.every((p) => p.value !== null)).toBe(true);
  });
});

describe("attendanceSplit", () => {
  // The headline guard. The reference dashboard this was modelled on showed
  // "0% attendance / 100% no-show" for an academy that had simply never marked
  // a register — an accusation rather than a measurement.
  it("reports no rate at all when nothing has been marked", () => {
    const split = attendanceSplit([]);
    expect(split).toMatchObject({ present: 0, absent: 0, marked: 0 });
    expect(split.presentRate).toBeNull();
    expect(split.noShowRate).toBeNull();
    expect(formatRate(split.presentRate)).toBe("—");
    expect(formatRate(split.noShowRate)).toBe("—");
  });

  it("counts present against marked rows", () => {
    const split = attendanceSplit([
      { present: true },
      { present: true },
      { present: true },
      { present: false },
    ]);
    expect(split).toMatchObject({ present: 3, absent: 1, marked: 4, presentRate: 75, noShowRate: 25 });
  });

  it("keeps the two rates complementary", () => {
    const split = attendanceSplit([{ present: true }, { present: false }, { present: false }]);
    expect(split.presentRate! + split.noShowRate!).toBe(100);
  });

  it("reports a real zero when everyone marked was absent", () => {
    const split = attendanceSplit([{ present: false }, { present: false }]);
    // Distinct from the empty case above: this 0% is a measurement.
    expect(split.presentRate).toBe(0);
    expect(split.noShowRate).toBe(100);
  });
});

describe("mean", () => {
  it("has no mean for an empty set", () => {
    expect(mean([])).toBeNull();
  });

  it("rounds", () => {
    expect(mean([60, 60, 90])).toBe(70);
    expect(mean([45])).toBe(45);
  });
});

describe("relativeTime", () => {
  it("describes the distance in words", () => {
    const now = new Date("2026-10-14T12:00:00.000Z");
    expect(relativeTime(new Date("2026-10-14T10:00:00.000Z"), now)).toBe("2 hours ago");
    expect(relativeTime(new Date("2026-10-12T12:00:00.000Z"), now)).toBe("2 days ago");
  });
});

describe("formatGrowth", () => {
  it("reads neutral at zero and positive above it", () => {
    expect(formatGrowth(0, "this month")).toEqual({ text: "+0 this month", tone: "flat" });
    expect(formatGrowth(3, "this month")).toEqual({ text: "+3 this month", tone: "up" });
  });
});

describe("formatComparison", () => {
  it("rises, falls, and says so when it does neither", () => {
    expect(formatComparison(5, 3, "vs last week")).toEqual({
      text: "+2 vs last week",
      tone: "up",
    });
    expect(formatComparison(3, 5, "vs last week")).toEqual({
      text: "−2 vs last week",
      tone: "down",
    });
  });

  // "+0" would read as steady growth; a quiet week following a busy one is
  // not the same thing as no change, so the words say which it is.
  it("spells out no change rather than reporting +0", () => {
    expect(formatComparison(4, 4, "vs last week")).toEqual({
      text: "No change vs last week",
      tone: "flat",
    });
    expect(formatComparison(0, 0, "vs last week").tone).toBe("flat");
  });
});
