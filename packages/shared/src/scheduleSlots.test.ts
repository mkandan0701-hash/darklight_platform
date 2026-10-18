import { describe, expect, it } from "vitest";
import { computeUpcomingOccurrencesUtc } from "./scheduleSlots";

describe("computeUpcomingOccurrencesUtc", () => {
  it("resolves a fixed-offset zone (no DST) as a control case", () => {
    // Wednesday, Jan 14 2026 UTC ~= Wednesday in Asia/Kolkata (UTC+5:30, no DST).
    const now = new Date("2026-01-14T10:00:00.000Z");
    const [first] = computeUpcomingOccurrencesUtc(
      { dayOfWeek: 6, localTime: "10:00", timezone: "Asia/Kolkata" }, // Saturday
      { now, horizonWeeks: 1 }
    );
    // Saturday 10:00 IST = 04:30 UTC.
    expect(first.occurrenceDate).toBe("2026-01-17");
    expect(first.scheduledAtUtc.toISOString()).toBe("2026-01-17T04:30:00.000Z");
  });

  it("keeps the local wall-clock time fixed across a DST boundary", () => {
    // US spring-forward 2026 is Sunday, March 8. Start a few weeks before it
    // and span past it with a Sunday 09:00 America/New_York slot.
    const now = new Date("2026-02-01T12:00:00.000Z"); // a Sunday
    const occurrences = computeUpcomingOccurrencesUtc(
      { dayOfWeek: 7, localTime: "09:00", timezone: "America/New_York" },
      { now, horizonWeeks: 8 }
    );

    const beforeTransition = occurrences.find((o) => o.occurrenceDate === "2026-03-01");
    const afterTransition = occurrences.find((o) => o.occurrenceDate === "2026-03-15");
    expect(beforeTransition).toBeDefined();
    expect(afterTransition).toBeDefined();

    // Before: EST is UTC-5, so 09:00 local = 14:00 UTC.
    expect(beforeTransition!.scheduledAtUtc.toISOString()).toBe("2026-03-01T14:00:00.000Z");
    // After: EDT is UTC-4, so 09:00 local = 13:00 UTC — same wall-clock time,
    // different UTC instant. A naive "+7 days in UTC" implementation would
    // have kept this at 14:00 UTC, i.e. 08:00 local — the bug this guards.
    expect(afterTransition!.scheduledAtUtc.toISOString()).toBe("2026-03-15T13:00:00.000Z");
  });

  it("returns exactly horizonWeeks occurrences", () => {
    const occurrences = computeUpcomingOccurrencesUtc(
      { dayOfWeek: 6, localTime: "10:00", timezone: "Asia/Kolkata" },
      { now: new Date("2026-01-14T10:00:00.000Z"), horizonWeeks: 5 }
    );
    expect(occurrences).toHaveLength(5);
  });

  it("rolls over to next week when today is the slot's day but the time has passed", () => {
    // Saturday, Jan 17 2026, 15:00 IST — past the 10:00 candidate.
    const now = new Date("2026-01-17T09:30:00.000Z"); // 15:00 IST
    const [first] = computeUpcomingOccurrencesUtc(
      { dayOfWeek: 6, localTime: "10:00", timezone: "Asia/Kolkata" },
      { now, horizonWeeks: 1 }
    );
    expect(first.occurrenceDate).toBe("2026-01-24");
  });

  it("picks today when today is the slot's day and the time has not yet passed", () => {
    // Saturday, Jan 17 2026, 08:00 IST — before the 10:00 candidate.
    const now = new Date("2026-01-17T02:30:00.000Z"); // 08:00 IST
    const [first] = computeUpcomingOccurrencesUtc(
      { dayOfWeek: 6, localTime: "10:00", timezone: "Asia/Kolkata" },
      { now, horizonWeeks: 1 }
    );
    expect(first.occurrenceDate).toBe("2026-01-17");
  });
});

describe("computeUpcomingOccurrencesUtc with startsOn", () => {
  it("produces nothing before startsOn, then carries on weekly", () => {
    const now = new Date("2026-01-14T10:00:00.000Z"); // a Wednesday
    const occurrences = computeUpcomingOccurrencesUtc(
      { dayOfWeek: 6, localTime: "10:00", timezone: "Asia/Kolkata", startsOn: "2026-01-31" },
      { now, horizonWeeks: 3 }
    );
    expect(occurrences.map((o) => o.occurrenceDate)).toEqual([
      "2026-01-31",
      "2026-02-07",
      "2026-02-14",
    ]);
  });

  it("treats a startsOn in the past as no bound", () => {
    const now = new Date("2026-01-14T10:00:00.000Z");
    const [first] = computeUpcomingOccurrencesUtc(
      { dayOfWeek: 6, localTime: "10:00", timezone: "Asia/Kolkata", startsOn: "2025-06-01" },
      { now, horizonWeeks: 1 }
    );
    expect(first.occurrenceDate).toBe("2026-01-17");
  });
});
