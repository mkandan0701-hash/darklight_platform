import { describe, expect, it, vi, afterEach } from "vitest";
import {
  zonedLocalToUtc,
  formatInZone,
  formatTimeInZone,
  nextWeekendLocalDefault,
  dateBlockInZone,
} from "./time";

describe("formatTimeInZone", () => {
  // The wedge case: one live-session chat message, two viewers, two clocks.
  it("renders the same instant on each viewer's own clock", () => {
    const sentAtUtc = "2026-01-15T14:30:00.000Z";
    expect(formatTimeInZone(sentAtUtc, "Asia/Kolkata")).toBe("20:00");
    expect(formatTimeInZone(sentAtUtc, "America/New_York")).toBe("09:30");
    expect(formatTimeInZone(sentAtUtc, "Europe/London")).toBe("14:30");
  });

  it("honours daylight saving in the viewer's zone", () => {
    // Same UTC clock time in July, but London is UTC+1 and New York UTC-4.
    const sentAtUtc = "2026-07-15T14:30:00.000Z";
    expect(formatTimeInZone(sentAtUtc, "Europe/London")).toBe("15:30");
    expect(formatTimeInZone(sentAtUtc, "America/New_York")).toBe("10:30");
  });

  it("returns an empty string rather than throwing on bad input", () => {
    // Rendered inside a chat list — a malformed timestamp must not blank the
    // whole session page.
    expect(formatTimeInZone("not-a-date", "Asia/Kolkata")).toBe("");
    expect(formatTimeInZone("2026-01-15T14:30:00.000Z", "Not/AZone")).toBe("");
  });
});

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

describe("dateBlockInZone", () => {
  // 22:30 UTC on 23 Dec is 04:00 on 24 Dec in Kolkata and 17:30 on 23 Dec in
  // New York — the same class on two different calendar days.
  const instant = new Date("2026-12-23T22:30:00.000Z");

  it("reads day and time from the viewer's zone together", () => {
    expect(dateBlockInZone(instant, "Asia/Kolkata")).toMatchObject({
      day: "24",
      month: "DEC",
      weekday: "Thu",
      time: "4:00 AM",
    });
    expect(dateBlockInZone(instant, "America/New_York")).toMatchObject({
      day: "23",
      month: "DEC",
      weekday: "Wed",
      time: "5:30 PM",
      zoneAbbr: "EST",
    });
  });
});
