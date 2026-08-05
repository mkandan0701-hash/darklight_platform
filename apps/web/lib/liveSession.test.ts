import { describe, expect, it } from "vitest";
import {
  effectiveSessionStatus,
  isUpcoming,
  sessionStatusLabel,
} from "./liveSession";

const START = new Date("2026-08-05T10:00:00.000Z");
const at = (iso: string) => new Date(iso);

const session = (overrides: Partial<Parameters<typeof effectiveSessionStatus>[0]> = {}) => ({
  scheduledAtUtc: START,
  durationMins: 60,
  status: "SCHEDULED",
  ...overrides,
});

// The bug this replaces: LiveSession.status was set once at creation and never
// updated, so every session ever taught still read SCHEDULED. Deriving the
// three time-determined statuses means none of them can go stale.
describe("effectiveSessionStatus", () => {
  it("is SCHEDULED before the start time", () => {
    expect(effectiveSessionStatus(session(), at("2026-08-05T09:59:59.000Z"))).toBe(
      "SCHEDULED"
    );
  });

  it("is LIVE from the start instant onward", () => {
    expect(effectiveSessionStatus(session(), START)).toBe("LIVE");
    expect(effectiveSessionStatus(session(), at("2026-08-05T10:59:59.000Z"))).toBe("LIVE");
  });

  it("is COMPLETED at the end instant, not a moment later", () => {
    expect(effectiveSessionStatus(session(), at("2026-08-05T11:00:00.000Z"))).toBe(
      "COMPLETED"
    );
  });

  it("is COMPLETED long afterwards", () => {
    expect(effectiveSessionStatus(session(), at("2026-09-01T00:00:00.000Z"))).toBe(
      "COMPLETED"
    );
  });

  // Cancelling is a human decision the clock knows nothing about, which is
  // exactly why it is the one status still stored on the row.
  it("keeps CANCELLED regardless of the clock", () => {
    const cancelled = session({ status: "CANCELLED" });
    for (const now of [
      at("2026-08-05T09:00:00.000Z"),
      START,
      at("2026-08-05T10:30:00.000Z"),
      at("2026-09-01T00:00:00.000Z"),
    ]) {
      expect(effectiveSessionStatus(cancelled, now)).toBe("CANCELLED");
    }
  });

  // A stored LIVE or COMPLETED is ignored — the clock is the authority, so a
  // row left over from any earlier write-based scheme can't contradict it.
  it("ignores a stale stored LIVE", () => {
    expect(
      effectiveSessionStatus(session({ status: "LIVE" }), at("2026-09-01T00:00:00.000Z"))
    ).toBe("COMPLETED");
  });

  // Bad data must not read as "permanently live": with a zero or negative
  // duration the end instant would land at or before the start.
  it("treats a zero or negative duration as ending immediately", () => {
    expect(effectiveSessionStatus(session({ durationMins: 0 }), START)).toBe("COMPLETED");
    expect(effectiveSessionStatus(session({ durationMins: -30 }), START)).toBe(
      "COMPLETED"
    );
  });

  it("survives a non-finite duration", () => {
    expect(effectiveSessionStatus(session({ durationMins: NaN }), START)).toBe(
      "COMPLETED"
    );
  });
});

describe("isUpcoming", () => {
  it("counts a session in progress, not just one not yet started", () => {
    expect(isUpcoming(session(), at("2026-08-05T10:30:00.000Z"))).toBe(true);
    expect(isUpcoming(session(), at("2026-08-05T09:00:00.000Z"))).toBe(true);
  });

  it("excludes finished and cancelled sessions", () => {
    expect(isUpcoming(session(), at("2026-08-05T12:00:00.000Z"))).toBe(false);
    expect(isUpcoming(session({ status: "CANCELLED" }), at("2026-08-05T09:00:00.000Z"))).toBe(
      false
    );
  });
});

describe("sessionStatusLabel", () => {
  it("labels every lifecycle state", () => {
    expect(sessionStatusLabel("SCHEDULED")).toBe("Scheduled");
    expect(sessionStatusLabel("LIVE")).toBe("Live now");
    expect(sessionStatusLabel("COMPLETED")).toBe("Finished");
    expect(sessionStatusLabel("CANCELLED")).toBe("Cancelled");
  });
});
