import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { formatSlotTime, hasAvailability, slotsForDate } from "./demoSlots";

// A fixed "now" well before the dates under test, so results don't drift.
const NOW = DateTime.fromISO("2026-01-05T00:00:00Z", { zone: "utc" });

describe("slotsForDate", () => {
  it("returns slots for a weekday", () => {
    // 2026-06-10 is a Wednesday.
    const slots = slotsForDate("2026-06-10", "Asia/Kolkata", NOW);
    expect(slots.length).toBeGreaterThan(0);
  });

  it("returns no slots on a Sunday in the host zone", () => {
    // 2026-06-14 is a Sunday.
    expect(slotsForDate("2026-06-14", "Asia/Kolkata", NOW)).toHaveLength(0);
  });

  it("omits slots that have already passed", () => {
    const dayStart = DateTime.fromISO("2026-06-10T00:00:00", { zone: "Asia/Kolkata" });
    const all = slotsForDate("2026-06-10", "Asia/Kolkata", NOW);
    // Pretend it is now midday on that same day.
    const midday = dayStart.set({ hour: 12 });
    const remaining = slotsForDate("2026-06-10", "Asia/Kolkata", midday);
    expect(remaining.length).toBeLessThan(all.length);
    for (const slot of remaining) {
      expect(slot.getTime()).toBeGreaterThan(midday.toMillis());
    }
  });

  it("only returns instants that fall on the requested date in the viewer's zone", () => {
    const zone = "America/Los_Angeles";
    const slots = slotsForDate("2026-06-10", zone, NOW);
    for (const slot of slots) {
      const iso = DateTime.fromJSDate(slot, { zone: "utc" }).setZone(zone).toISODate();
      expect(iso).toBe("2026-06-10");
    }
  });

  it("gives a US viewer slots derived from the host's working window", () => {
    // The host window is 09:00–18:00 Asia/Kolkata, which lands overnight/early
    // morning in Los Angeles — the point of the conversion is that a US viewer
    // still sees real, bookable instants rather than an empty day.
    const slots = slotsForDate("2026-06-10", "America/Los_Angeles", NOW);
    expect(slots.length).toBeGreaterThan(0);
  });

  it("returns nothing for an invalid date", () => {
    expect(slotsForDate("not-a-date", "Asia/Kolkata", NOW)).toHaveLength(0);
  });
});

describe("hasAvailability", () => {
  it("is true for a weekday and false for a weekend", () => {
    expect(hasAvailability("2026-06-10", "Asia/Kolkata", NOW)).toBe(true);
    expect(hasAvailability("2026-06-14", "Asia/Kolkata", NOW)).toBe(false);
  });
});

describe("formatSlotTime", () => {
  it("renders the same instant differently per viewer zone", () => {
    const instant = DateTime.fromISO("2026-06-10T04:00:00Z", { zone: "utc" }).toJSDate();
    expect(formatSlotTime(instant, "Asia/Kolkata")).toBe("9:30 AM");
    expect(formatSlotTime(instant, "Europe/London")).toBe("5:00 AM");
  });
});
