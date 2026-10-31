import { describe, expect, it } from "vitest";
import {
  effectiveSessionStatus,
  isUpcoming,
  sessionStatusLabel,
  sessionBucket,
  isUnconfirmed,
  canStartSession,
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

describe("sessionBucket", () => {
  const bucketable = (overrides: Partial<Parameters<typeof sessionBucket>[0]> = {}) => ({
    ...session(),
    startedAtUtc: null,
    ...overrides,
  });
  const none = { hasAttendance: false };

  it("is UPCOMING more than 15 minutes before the start", () => {
    expect(sessionBucket(bucketable(), none, at("2026-08-05T09:44:59.000Z"))).toBe("UPCOMING");
  });

  it("is CURRENT from 15 minutes before the start", () => {
    expect(sessionBucket(bucketable(), none, at("2026-08-05T09:45:00.000Z"))).toBe("CURRENT");
  });

  it("is CURRENT while the class is running, started or not", () => {
    expect(sessionBucket(bucketable(), none, at("2026-08-05T10:30:00.000Z"))).toBe("CURRENT");
  });

  it("is DELAYED once it ends without being started or marked", () => {
    expect(sessionBucket(bucketable(), none, at("2026-08-05T11:00:00.000Z"))).toBe("DELAYED");
  });

  it("is COMPLETED once ended if the coach started it", () => {
    const s = bucketable({ startedAtUtc: at("2026-08-05T10:02:00.000Z") });
    expect(sessionBucket(s, none, at("2026-08-05T11:00:00.000Z"))).toBe("COMPLETED");
  });

  it("is COMPLETED once ended if attendance was marked instead", () => {
    expect(
      sessionBucket(bucketable(), { hasAttendance: true }, at("2026-08-05T11:00:00.000Z"))
    ).toBe("COMPLETED");
  });

  it("stops being DELAYED 14 days after the end, and is filed as unconfirmed", () => {
    const justInside = at("2026-08-19T10:59:59.000Z");
    const atCutoff = at("2026-08-19T11:00:00.000Z");
    expect(sessionBucket(bucketable(), none, justInside)).toBe("DELAYED");
    expect(sessionBucket(bucketable(), none, atCutoff)).toBe("COMPLETED");
    expect(isUnconfirmed(bucketable(), none, atCutoff)).toBe(true);
  });

  it("does not call a confirmed class unconfirmed", () => {
    const s = bucketable({ startedAtUtc: START });
    expect(isUnconfirmed(s, none, at("2026-09-30T00:00:00.000Z"))).toBe(false);
  });

  it("is CANCELLED whatever the clock or the evidence says", () => {
    const s = bucketable({ status: "CANCELLED", startedAtUtc: START });
    expect(sessionBucket(s, { hasAttendance: true }, at("2026-08-05T10:30:00.000Z"))).toBe(
      "CANCELLED"
    );
  });
});

describe("canStartSession", () => {
  const s = { ...session(), startedAtUtc: null };
  const none = { hasAttendance: false };

  it("refuses a class that is still upcoming", () => {
    expect(canStartSession(s, none, at("2026-08-05T09:00:00.000Z"))).toBe(false);
  });

  it("allows a current or delayed class", () => {
    expect(canStartSession(s, none, at("2026-08-05T09:50:00.000Z"))).toBe(true);
    expect(canStartSession(s, none, at("2026-08-06T10:00:00.000Z"))).toBe(true);
  });

  it("refuses a cancelled or already-completed class", () => {
    expect(canStartSession({ ...s, status: "CANCELLED" }, none, START)).toBe(false);
    expect(
      canStartSession(s, { hasAttendance: true }, at("2026-08-06T10:00:00.000Z"))
    ).toBe(false);
  });
});
