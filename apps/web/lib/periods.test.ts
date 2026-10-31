import { describe, expect, it } from "vitest";
import {
  dayLabel,
  daysInRange,
  lastNDays,
  lastNWeeks,
  localDayKey,
  localMonthKey,
  monthLabel,
  monthsInRange,
  periodBounds,
  previousPeriodBounds,
} from "./periods";

const IST = "Asia/Kolkata";
const NY = "America/New_York";

// A Wednesday: 2026-10-14T12:00 IST === 2026-10-14T06:30Z
const wednesday = new Date("2026-10-14T06:30:00.000Z");

describe("periodBounds", () => {
  it("starts the week on Monday", () => {
    const week = periodBounds("week", IST, wednesday);
    // Mon 12 Oct 00:00 IST is Sun 11 Oct 18:30 UTC.
    expect(week.start.toISOString()).toBe("2026-10-11T18:30:00.000Z");
    expect(week.end.toISOString()).toBe("2026-10-18T18:30:00.000Z");
  });

  it("bounds the day at local midnight, not UTC midnight", () => {
    const day = periodBounds("day", IST, wednesday);
    expect(day.start.toISOString()).toBe("2026-10-13T18:30:00.000Z");
    expect(day.end.toISOString()).toBe("2026-10-14T18:30:00.000Z");
  });

  it("bounds the month and the year", () => {
    expect(periodBounds("month", IST, wednesday).start.toISOString()).toBe(
      "2026-09-30T18:30:00.000Z"
    );
    expect(periodBounds("year", IST, wednesday).start.toISOString()).toBe(
      "2025-12-31T18:30:00.000Z"
    );
  });

  it("is half-open, so one period's end is the next one's start", () => {
    const week = periodBounds("week", IST, wednesday);
    const next = periodBounds("week", IST, week.end);
    expect(next.start.getTime()).toBe(week.end.getTime());
  });

  it("refuses a timezone it cannot resolve rather than silently using UTC", () => {
    expect(() => periodBounds("week", "Not/AZone", wednesday)).toThrow(/timezone/i);
  });
});

describe("previousPeriodBounds", () => {
  it("ends exactly where the current period begins", () => {
    const current = periodBounds("week", IST, wednesday);
    const previous = previousPeriodBounds("week", IST, wednesday);
    expect(previous.end.getTime()).toBe(current.start.getTime());
  });

  // February is the case a "minus 30 days" implementation gets wrong.
  it("steps back a calendar month, not a fixed number of days", () => {
    const march = new Date("2026-03-15T00:00:00.000Z");
    const previous = previousPeriodBounds("month", "UTC", march);
    expect(previous.start.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(previous.end.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });
});

describe("daysInRange across a DST transition", () => {
  // US spring-forward 2026 is Sunday 8 March. That week is 167 hours long, so
  // anything that walks it in 24-hour steps yields six days or eight and
  // silently drops or duplicates a column on the chart.
  it("still yields exactly seven days in the spring-forward week", () => {
    const duringThatWeek = new Date("2026-03-04T17:00:00.000Z");
    const week = periodBounds("week", NY, duringThatWeek);
    const days = daysInRange(week, NY);
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-03-02");
    expect(days[6]).toBe("2026-03-08");
    // 167 hours, not 168 — proving the transition really is inside this week.
    expect((week.end.getTime() - week.start.getTime()) / 3_600_000).toBe(167);
  });

  it("still yields exactly seven days in the autumn fall-back week", () => {
    const duringThatWeek = new Date("2026-10-28T17:00:00.000Z");
    const week = periodBounds("week", NY, duringThatWeek);
    expect(daysInRange(week, NY)).toHaveLength(7);
    expect((week.end.getTime() - week.start.getTime()) / 3_600_000).toBe(169);
  });

  it("yields seven for an ordinary week too", () => {
    expect(daysInRange(periodBounds("week", IST, wednesday), IST)).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
  });
});

describe("monthsInRange", () => {
  it("yields twelve keys for a year, in order", () => {
    const months = monthsInRange(periodBounds("year", IST, wednesday), IST);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2026-01");
    expect(months[11]).toBe("2026-12");
  });
});

describe("lastNDays", () => {
  it("is inclusive of today and starts at local midnight n-1 days back", () => {
    const window = lastNDays(30, IST, wednesday);
    expect(daysInRange(window, IST)).toHaveLength(30);
    expect(localDayKey(window.start, IST)).toBe("2026-09-15");
    // end is exclusive, so the last included day is today.
    expect(daysInRange(window, IST).at(-1)).toBe("2026-10-14");
  });
});

describe("lastNWeeks", () => {
  it("returns n weeks oldest-first, ending with the week containing now", () => {
    const weeks = lastNWeeks(8, IST, wednesday);
    expect(weeks).toHaveLength(8);
    expect(weeks.at(-1)!.start.getTime()).toBe(periodBounds("week", IST, wednesday).start.getTime());
    for (let i = 1; i < weeks.length; i++) {
      expect(weeks[i].start.getTime()).toBe(weeks[i - 1].end.getTime());
    }
  });
});

describe("bucket keys", () => {
  // 2026-10-14T19:00Z is already the 15th in IST (+05:30). Bucketing on the
  // UTC date would file this under the wrong day.
  it("files a late-evening UTC instant under the correct local day", () => {
    const lateUtc = new Date("2026-10-14T19:00:00.000Z");
    expect(localDayKey(lateUtc, IST)).toBe("2026-10-15");
    expect(localDayKey(lateUtc, "UTC")).toBe("2026-10-14");
  });

  it("rolls the month key over with it", () => {
    const lastEvening = new Date("2026-10-31T19:00:00.000Z");
    expect(localMonthKey(lastEvening, IST)).toBe("2026-11");
    expect(localMonthKey(lastEvening, "UTC")).toBe("2026-10");
  });
});

describe("axis labels", () => {
  it("names the weekday and the month", () => {
    expect(dayLabel("2026-10-12", IST)).toBe("Mon");
    expect(monthLabel("2026-01", IST)).toBe("Jan");
  });
});
