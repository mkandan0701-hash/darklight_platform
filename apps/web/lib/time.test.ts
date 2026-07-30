import { describe, expect, it, vi, afterEach } from "vitest";
import { zonedLocalToUtc, formatInZone, nextWeekendLocalDefault } from "./time";

describe("zonedLocalToUtc", () => {
  it("interprets a datetime-local value in the given zone and converts to UTC", () => {
    // 09:00 in America/New_York (UTC-5 in January) is 14:00 UTC.
    const utc = zonedLocalToUtc("2026-01-15T09:00", "America/New_York");
    expect(utc.toISOString()).toBe("2026-01-15T14:00:00.000Z");
  });

  it("accounts for daylight saving differences between zones", () => {
    // 09:00 in America/New_York (UTC-4 in July, DST) is 13:00 UTC.
    const utc = zonedLocalToUtc("2026-07-15T09:00", "America/New_York");
    expect(utc.toISOString()).toBe("2026-07-15T13:00:00.000Z");
  });

  it("throws for an invalid timezone", () => {
    expect(() => zonedLocalToUtc("2026-01-15T09:00", "Not/AZone")).toThrow(
      /Invalid date\/time or timezone/
    );
  });

  it("throws for a malformed datetime string", () => {
    expect(() => zonedLocalToUtc("not-a-date", "America/New_York")).toThrow(
      /Invalid date\/time or timezone/
    );
  });
});

describe("formatInZone", () => {
  it("formats a UTC date in the viewer's zone, not the original zone", () => {
    // 14:00 UTC is 09:00 in America/New_York and 19:30 in Asia/Kolkata.
    const utcDate = new Date("2026-01-15T14:00:00.000Z");
    expect(formatInZone(utcDate, "America/New_York")).toContain("09:00");
    expect(formatInZone(utcDate, "Asia/Kolkata")).toContain("19:30");
  });
});

describe("nextWeekendLocalDefault", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the upcoming Saturday at 10:00 when today is before Saturday", () => {
    // Wednesday, Jan 14 2026 in America/New_York.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-14T15:00:00.000Z"));

    const result = nextWeekendLocalDefault("America/New_York");
    expect(result).toBe("2026-01-17T10:00");
  });

  it("rolls over to next week's Saturday when today is already past 10:00 Saturday", () => {
    // Saturday, Jan 17 2026, 15:00 local — past the 10:00 candidate.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-17T20:00:00.000Z"));

    const result = nextWeekendLocalDefault("America/New_York");
    expect(result).toBe("2026-01-24T10:00");
  });
});
