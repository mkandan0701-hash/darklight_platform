import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { MAX_OCCURRENCES, RecurrenceError, expandRecurrence } from "./recurrence";

const local = (d: Date, zone: string) => DateTime.fromJSDate(d, { zone }).toFormat("ccc yyyy-LL-dd HH:mm");

describe("expandRecurrence", () => {
  it("stores 6:00 PM IST as the right instant — 8:30 AM in New York during US daylight time", () => {
    const [occ] = expandRecurrence("2026-10-17T18:00", "Asia/Kolkata", { freq: "NONE" });
    expect(occ.startUtc.toISOString()).toBe("2026-10-17T12:30:00.000Z");
    expect(local(occ.startUtc, "America/New_York")).toBe("Sat 2026-10-17 08:30");
    // …and 7:30 AM once New York falls back (IST has no DST).
    const [later] = expandRecurrence("2026-11-14T18:00", "Asia/Kolkata", { freq: "NONE" });
    expect(local(later.startUtc, "America/New_York")).toBe("Sat 2026-11-14 07:30");
  });

  it("puts a weekly class on the chosen weekdays, starting from the next match", () => {
    // Start is a Monday; rule is Tue/Thu, four classes.
    const occ = expandRecurrence("2026-10-19T17:00", "Asia/Kolkata", {
      freq: "WEEKLY",
      interval: 1,
      weekdays: [4, 2],
      end: { kind: "COUNT", count: 4 },
    });
    expect(occ.map((o) => o.occurrenceDate)).toEqual(["2026-10-20", "2026-10-22", "2026-10-27", "2026-10-29"]);
  });

  it("keeps a US-zone weekly class at the same wall-clock time across the DST change", () => {
    const occ = expandRecurrence("2026-10-24T10:00", "America/New_York", {
      freq: "WEEKLY",
      interval: 1,
      weekdays: [6],
      end: { kind: "COUNT", count: 3 },
    });
    expect(occ.map((o) => local(o.startUtc, "America/New_York"))).toEqual([
      "Sat 2026-10-24 10:00",
      "Sat 2026-10-31 10:00",
      "Sat 2026-11-07 10:00",
    ]);
    // Same local time, different UTC offset after 1 Nov.
    expect(occ[1].startUtc.toISOString()).toBe("2026-10-31T14:00:00.000Z");
    expect(occ[2].startUtc.toISOString()).toBe("2026-11-07T15:00:00.000Z");
  });

  it("honours an every-other-week interval and an inclusive end date", () => {
    const occ = expandRecurrence("2026-10-17T10:00", "Asia/Kolkata", {
      freq: "WEEKLY",
      interval: 2,
      weekdays: [6],
      end: { kind: "UNTIL", until: "2026-11-14" },
    });
    expect(occ.map((o) => o.occurrenceDate)).toEqual(["2026-10-17", "2026-10-31", "2026-11-14"]);
  });

  it("repeats every N days", () => {
    const occ = expandRecurrence("2026-10-18T07:00", "Asia/Kolkata", {
      freq: "DAILY",
      interval: 3,
      end: { kind: "COUNT", count: 3 },
    });
    expect(occ.map((o) => o.occurrenceDate)).toEqual(["2026-10-18", "2026-10-21", "2026-10-24"]);
  });

  it("is deterministic — re-expanding the same rule yields identical instants", () => {
    const rule = { freq: "WEEKLY" as const, interval: 1, weekdays: [2, 4], end: { kind: "COUNT" as const, count: 6 } };
    const a = expandRecurrence("2026-10-19T17:00", "Europe/London", rule);
    const b = expandRecurrence("2026-10-19T17:00", "Europe/London", rule);
    expect(a.map((o) => o.startUtc.getTime())).toEqual(b.map((o) => o.startUtc.getTime()));
  });

  it("caps a far-off end date at MAX_OCCURRENCES", () => {
    const occ = expandRecurrence("2026-10-18T07:00", "UTC", {
      freq: "DAILY",
      interval: 1,
      end: { kind: "UNTIL", until: "2030-01-01" },
    });
    expect(occ).toHaveLength(MAX_OCCURRENCES);
  });

  it("rejects invalid input instead of guessing", () => {
    expect(() => expandRecurrence("2026-02-30T10:00", "UTC", { freq: "NONE" })).toThrow(RecurrenceError);
    expect(() =>
      expandRecurrence("2026-10-18T10:00", "UTC", { freq: "DAILY", interval: 0, end: { kind: "COUNT", count: 2 } })
    ).toThrow(RecurrenceError);
    expect(() =>
      expandRecurrence("2026-10-18T10:00", "UTC", { freq: "DAILY", interval: 1, end: { kind: "COUNT", count: 500 } })
    ).toThrow(RecurrenceError);
  });
});
