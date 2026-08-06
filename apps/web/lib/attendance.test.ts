import { describe, expect, it } from "vitest";
import {
  attendanceRate,
  countAttendance,
  eligibleSessions,
  formatAttendanceRate,
  resolveStatus,
} from "./attendance";

const JAN = new Date("2026-01-10T10:00:00.000Z");
const FEB = new Date("2026-02-10T10:00:00.000Z");
const MAR = new Date("2026-03-10T10:00:00.000Z");

describe("attendanceRate", () => {
  it("rounds to a whole percentage", () => {
    expect(attendanceRate(1, 3)).toBe(33);
    expect(attendanceRate(2, 3)).toBe(67);
    expect(attendanceRate(4, 4)).toBe(100);
  });

  // 0/0 is not 0% — a brand-new student hasn't missed anything yet, and
  // showing them at 0% accuses them of missing every class.
  it("has no rate when there is nothing to divide by", () => {
    expect(attendanceRate(0, 0)).toBeNull();
    expect(formatAttendanceRate(0, 0)).toBe("—");
  });

  it("never divides by a negative total", () => {
    expect(attendanceRate(0, -1)).toBeNull();
  });
});

describe("resolveStatus", () => {
  it("distinguishes absent from never marked", () => {
    expect(resolveStatus({ present: true })).toBe("present");
    expect(resolveStatus({ present: false })).toBe("absent");
    expect(resolveStatus(undefined)).toBe("unmarked");
  });
});

describe("countAttendance", () => {
  const markedSessions = [
    { liveSessionId: "s_jan", scheduledAtUtc: JAN },
    { liveSessionId: "s_feb", scheduledAtUtc: FEB },
    { liveSessionId: "s_mar", scheduledAtUtc: MAR },
  ];

  it("counts every marked session for a student enrolled from the start", () => {
    expect(
      countAttendance({
        enrolledAt: new Date("2026-01-01T00:00:00.000Z"),
        markedSessions,
        presentSessionIds: new Set(["s_jan", "s_mar"]),
      })
    ).toEqual({ attendedCount: 2, sessionCount: 3 });
  });

  // The rule that stops a mid-term joiner opening on a terrible rate.
  it("ignores sessions that happened before the student enrolled", () => {
    expect(
      countAttendance({
        enrolledAt: FEB,
        markedSessions,
        presentSessionIds: new Set(["s_feb"]),
      })
    ).toEqual({ attendedCount: 1, sessionCount: 2 });
  });

  it("counts a session held exactly at the enrolment instant", () => {
    expect(
      countAttendance({
        enrolledAt: MAR,
        markedSessions,
        presentSessionIds: new Set(["s_mar"]),
      })
    ).toEqual({ attendedCount: 1, sessionCount: 1 });
  });

  // A stray record predating enrolment must not be counted in the numerator
  // while its session is excluded from the denominator — that would report
  // someone at over 100%.
  it("cannot exceed 100% when a present record predates enrolment", () => {
    const { attendedCount, sessionCount } = countAttendance({
      enrolledAt: MAR,
      markedSessions,
      presentSessionIds: new Set(["s_jan", "s_feb", "s_mar"]),
    });
    expect(attendedCount).toBe(1);
    expect(sessionCount).toBe(1);
    expect(attendanceRate(attendedCount, sessionCount)).toBe(100);
  });

  // Unmarked and future sessions never produce a record, so they never reach
  // markedSessions — an empty list means "nothing to judge", not "absent".
  it("reports no sessions when nothing has been marked", () => {
    expect(
      countAttendance({
        enrolledAt: JAN,
        markedSessions: [],
        presentSessionIds: new Set(),
      })
    ).toEqual({ attendedCount: 0, sessionCount: 0 });
  });

  it("counts a student marked absent for everything as zero of the total", () => {
    expect(
      countAttendance({
        enrolledAt: JAN,
        markedSessions,
        presentSessionIds: new Set(),
      })
    ).toEqual({ attendedCount: 0, sessionCount: 3 });
  });
});

// countAttendance is now derived from this, so the six cases above double as
// its regression guard. These cover only what the rows add: the present flag,
// and the ordering the parent-facing table reads down.
describe("eligibleSessions", () => {
  const sessions = [
    { liveSessionId: "jan", scheduledAtUtc: JAN },
    { liveSessionId: "mar", scheduledAtUtc: MAR },
    { liveSessionId: "feb", scheduledAtUtc: FEB },
  ];

  it("returns newest first", () => {
    const rows = eligibleSessions({
      enrolledAt: JAN,
      markedSessions: sessions,
      presentSessionIds: new Set(),
    });
    expect(rows.map((r) => r.liveSessionId)).toEqual(["mar", "feb", "jan"]);
  });

  it("drops sessions held before the student enrolled", () => {
    const rows = eligibleSessions({
      enrolledAt: FEB,
      markedSessions: sessions,
      presentSessionIds: new Set(),
    });
    expect(rows.map((r) => r.liveSessionId)).toEqual(["mar", "feb"]);
  });

  it("flags presence from the id set", () => {
    const rows = eligibleSessions({
      enrolledAt: JAN,
      markedSessions: sessions,
      presentSessionIds: new Set(["mar"]),
    });
    expect(rows.find((r) => r.liveSessionId === "mar")!.present).toBe(true);
    expect(rows.find((r) => r.liveSessionId === "jan")!.present).toBe(false);
  });

  // The invariant that keeps the summary card honest against the table.
  it("counts to exactly what countAttendance reports", () => {
    const params = {
      enrolledAt: FEB,
      markedSessions: sessions,
      presentSessionIds: new Set(["mar"]),
    };
    const rows = eligibleSessions(params);
    const counts = countAttendance(params);
    expect(rows.length).toBe(counts.sessionCount);
    expect(rows.filter((r) => r.present).length).toBe(counts.attendedCount);
  });
});
