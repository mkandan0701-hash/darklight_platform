import { describe, expect, it } from "vitest";
import { daysInRange, parseAnchor, rangeLabel, resolveZone, shiftAnchor, viewRange } from "./range";

describe("viewRange", () => {
  it("starts a month grid on the Monday on or before the 1st and spans six weeks", () => {
    // October 2026 starts on a Thursday — the reference screenshot's grid
    // begins Mon 28 Sep.
    const anchor = parseAnchor("2026-10-18", "Asia/Kolkata");
    const { start, end } = viewRange("month", anchor);
    expect(start.toFormat("ccc yyyy-LL-dd HH:mm")).toBe("Mon 2026-09-28 00:00");
    expect(daysInRange(start, end)).toHaveLength(42);
  });

  it("builds the range from local midnights in the viewer's zone, not UTC", () => {
    const ist = viewRange("day", parseAnchor("2026-10-18", "Asia/Kolkata"));
    const ny = viewRange("day", parseAnchor("2026-10-18", "America/New_York"));
    expect(ist.start.toUTC().toISO()).toBe("2026-10-17T18:30:00.000Z");
    expect(ny.start.toUTC().toISO()).toBe("2026-10-18T04:00:00.000Z");
  });

  it("ends a week that crosses a DST change at local midnight, seven days later", () => {
    // US clocks fall back on Sunday 1 Nov 2026: that week is 169 hours long.
    const anchor = parseAnchor("2026-10-28", "America/New_York");
    const { start, end } = viewRange("week", anchor);
    expect(start.toFormat("ccc yyyy-LL-dd HH:mm")).toBe("Mon 2026-10-26 00:00");
    expect(end.toFormat("ccc yyyy-LL-dd HH:mm")).toBe("Mon 2026-11-02 00:00");
    expect(end.diff(start, "hours").hours).toBe(169);
    expect(daysInRange(start, end)).toHaveLength(7);
  });
});

describe("shiftAnchor", () => {
  it("moves month by month from the 1st, so 31 Jan doesn't skip February", () => {
    const next = shiftAnchor("month", parseAnchor("2026-01-31", "UTC"), 1);
    expect(next.toFormat("yyyy-LL-dd")).toBe("2026-02-01");
  });

  it("crosses a year boundary", () => {
    expect(shiftAnchor("month", parseAnchor("2026-12-05", "UTC"), 1).toFormat("yyyy-LL")).toBe("2027-01");
    expect(shiftAnchor("week", parseAnchor("2027-01-02", "UTC"), -1).toFormat("yyyy-LL-dd")).toBe("2026-12-26");
  });
});

describe("parseAnchor / resolveZone", () => {
  it("falls back to today for a mangled date rather than throwing", () => {
    const now = new Date("2026-10-18T03:00:00Z");
    expect(parseAnchor("2026-13-45", "Asia/Kolkata", now).toFormat("yyyy-LL-dd")).toBe("2026-10-18");
    expect(parseAnchor(undefined, "America/New_York", now).toFormat("yyyy-LL-dd")).toBe("2026-10-17");
  });

  it("takes the first valid zone and defaults to IST", () => {
    expect(resolveZone("Not/AZone", "America/Chicago")).toBe("America/Chicago");
    expect(resolveZone(undefined, "", null)).toBe("Asia/Kolkata");
  });
});

describe("rangeLabel", () => {
  it("labels each view", () => {
    const a = parseAnchor("2026-10-18", "UTC");
    expect(rangeLabel("month", a)).toBe("October 2026");
    expect(rangeLabel("week", a)).toBe("12 – 18 Oct 2026");
    expect(rangeLabel("day", a)).toBe("Sunday, 18 October 2026");
  });
});
