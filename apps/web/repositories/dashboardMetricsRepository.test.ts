import { beforeEach, describe, expect, it, vi } from "vitest";

const userCount = vi.fn();
const userFindMany = vi.fn();
const sessionCount = vi.fn();
const sessionFindMany = vi.fn();
const tournamentCount = vi.fn();
const assignmentCount = vi.fn();
const attendanceFindMany = vi.fn();
const puzzleAttemptFindMany = vi.fn();
const gameFindMany = vi.fn();
const xpFindMany = vi.fn();
const forbidden = vi.fn();

// React's `cache` only exists under the react-server condition, which plain
// Vitest does not run. Memoization is a request-dedupe concern, not something
// these assertions are about, so it becomes a passthrough here.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T,>(fn: T) => fn };
});

vi.mock("@chessplay-clone/db", () => ({
  prisma: {
    user: { count: (...a: unknown[]) => userCount(...a), findMany: (...a: unknown[]) => userFindMany(...a) },
    liveSession: {
      count: (...a: unknown[]) => sessionCount(...a),
      findMany: (...a: unknown[]) => sessionFindMany(...a),
    },
    tournament: { count: (...a: unknown[]) => tournamentCount(...a) },
    assignment: { count: (...a: unknown[]) => assignmentCount(...a) },
    attendanceRecord: { findMany: (...a: unknown[]) => attendanceFindMany(...a) },
    puzzleAttempt: { findMany: (...a: unknown[]) => puzzleAttemptFindMany(...a) },
    game: { findMany: (...a: unknown[]) => gameFindMany(...a) },
    xpEvent: { findMany: (...a: unknown[]) => xpFindMany(...a) },
    // tenantScope guards neither of these, so a grouped query would silently
    // read across every academy. Calling one fails the test rather than
    // leaking quietly.
    $queryRaw: forbidden,
  },
}));

const { getEngagement, getStatCounts, getStudentSignups, getUpcomingSessions } = await import(
  "./dashboardMetricsRepository"
);

const IST = "Asia/Kolkata";
const now = new Date("2026-10-14T06:30:00.000Z");
const allMocks = [
  userCount,
  userFindMany,
  sessionCount,
  sessionFindMany,
  tournamentCount,
  assignmentCount,
  attendanceFindMany,
  puzzleAttemptFindMany,
  gameFindMany,
  xpFindMany,
  forbidden,
];

beforeEach(() => {
  allMocks.forEach((m) => m.mockReset());
  userCount.mockResolvedValue(0);
  userFindMany.mockResolvedValue([]);
  sessionCount.mockResolvedValue(0);
  sessionFindMany.mockResolvedValue([]);
  tournamentCount.mockResolvedValue(0);
  assignmentCount.mockResolvedValue(0);
  attendanceFindMany.mockResolvedValue([]);
  puzzleAttemptFindMany.mockResolvedValue([]);
  gameFindMany.mockResolvedValue([]);
  xpFindMany.mockResolvedValue([]);
});

function everyWhere(mock: ReturnType<typeof vi.fn>) {
  return mock.mock.calls.map((c) => (c[0] as { where: Record<string, unknown> }).where);
}

describe("getStatCounts", () => {
  it("scopes every single query to the tenant", async () => {
    await getStatCounts("tenant_1", IST, now);
    const wheres = [
      ...everyWhere(userCount),
      ...everyWhere(sessionCount),
      ...everyWhere(tournamentCount),
      ...everyWhere(assignmentCount),
      ...everyWhere(sessionFindMany),
    ];
    expect(wheres.length).toBeGreaterThan(8);
    for (const where of wheres) {
      expect(where.tenantId).toBe("tenant_1");
    }
  });

  // StudentProfile has no deletedAt of its own, so a headcount that forgets
  // this counts deactivated accounts as current pupils.
  it("excludes deactivated accounts from every student count", async () => {
    await getStatCounts("tenant_1", IST, now);
    for (const where of everyWhere(userCount)) {
      expect(where).toMatchObject({ role: "STUDENT", deletedAt: null });
    }
  });

  it("never counts a cancelled class as a scheduled one", async () => {
    await getStatCounts("tenant_1", IST, now);
    for (const where of everyWhere(sessionCount)) {
      expect(where.status).toEqual({ not: "CANCELLED" });
    }
  });

  it("bounds this week in the academy's zone, not UTC", async () => {
    await getStatCounts("tenant_1", IST, now);
    const weekly = everyWhere(userCount).find(
      (w) => w.createdAt && (w.createdAt as { gte: Date }).gte.toISOString().endsWith("18:30:00.000Z")
    );
    // Monday 00:00 IST is Sunday 18:30 UTC — the giveaway that the boundary
    // was computed in the academy's zone.
    expect(weekly).toBeDefined();
  });

  it("counts only tournaments still to come as upcoming", async () => {
    await getStatCounts("tenant_1", IST, now);
    const upcoming = everyWhere(tournamentCount).find((w) => w.startsAtUtc);
    expect(upcoming!.startsAtUtc).toEqual({ gte: now });
  });

  // A session is live when now falls between its start and start+duration,
  // which is not expressible as a Prisma filter — so it is derived in JS from
  // the day's rows by the same helper every other screen uses.
  it("derives live-now from today's rows rather than from a status column", async () => {
    sessionFindMany.mockResolvedValue([
      // Started 30 minutes ago, runs 60 — live.
      { scheduledAtUtc: new Date(now.getTime() - 30 * 60_000), durationMins: 60, status: "SCHEDULED" },
      // Finished an hour ago.
      { scheduledAtUtc: new Date(now.getTime() - 180 * 60_000), durationMins: 60, status: "SCHEDULED" },
      // Starts later today.
      { scheduledAtUtc: new Date(now.getTime() + 120 * 60_000), durationMins: 60, status: "SCHEDULED" },
    ]);
    const stats = await getStatCounts("tenant_1", IST, now);
    expect(stats.liveNow).toBe(1);
    expect(stats.sessionsToday).toBe(3);
  });
});

describe("getStudentSignups", () => {
  it("reads the signup moment off User, which is the only place it exists", async () => {
    userFindMany.mockResolvedValue([{ createdAt: now }]);
    const result = await getStudentSignups("tenant_1", IST, "year", now);
    const args = userFindMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ tenantId: "tenant_1", role: "STUDENT", deletedAt: null });
    expect(args.select).toEqual({ createdAt: true });
    expect(result.timestamps).toEqual([now]);
  });

  it("asks only for the column it folds, not whole user rows", async () => {
    await getStudentSignups("tenant_1", IST, "week", now);
    expect(userFindMany.mock.calls[0][0].select).toEqual({ createdAt: true });
  });
});

describe("getEngagement", () => {
  it("scopes and windows every query", async () => {
    await getEngagement("tenant_1", IST, now);
    for (const mock of [attendanceFindMany, puzzleAttemptFindMany, gameFindMany, xpFindMany, sessionFindMany]) {
      for (const where of everyWhere(mock)) {
        expect(where.tenantId).toBe("tenant_1");
      }
    }
  });

  // No isActive column exists, so this is a union of four behaviours — and a
  // student who did two of them is still one student.
  it("counts a student active once however many ways they were active", async () => {
    // Two different attendance reads share this mock — the trend rows and the
    // distinct-student roll-up — so answer each with the shape it selected.
    attendanceFindMany.mockImplementation((args: { select: Record<string, unknown> }) =>
      Promise.resolve(args.select.studentId ? [{ studentId: "s1" }] : [])
    );
    puzzleAttemptFindMany.mockResolvedValue([{ studentId: "s1" }, { studentId: "s2" }]);
    gameFindMany.mockResolvedValue([{ studentId: "s2" }]);
    xpFindMany.mockResolvedValue([{ studentId: "s3" }]);
    userCount.mockResolvedValue(10);

    const engagement = await getEngagement("tenant_1", IST, now);
    expect(engagement.activeStudents).toBe(3);
    expect(engagement.totalStudents).toBe(10);
  });

  it("returns eight trend weeks, oldest first, even with no data at all", async () => {
    const engagement = await getEngagement("tenant_1", IST, now);
    expect(engagement.weeklyAttendance).toHaveLength(8);
    expect(engagement.weeklyAttendance.map((w) => w.label)).toEqual([
      "W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8",
    ]);
    // Empty, not zero: a week nobody marked has no rate, and the chart must be
    // able to tell those apart.
    expect(engagement.weeklyAttendance.every((w) => w.records.length === 0)).toBe(true);
  });

  it("files each attendance row into the week its class was held", async () => {
    // This week (w/c Mon 12 Oct IST) and three weeks earlier.
    attendanceFindMany.mockResolvedValue([
      { present: true, liveSession: { scheduledAtUtc: new Date("2026-10-14T05:00:00.000Z") } },
      { present: false, liveSession: { scheduledAtUtc: new Date("2026-09-23T05:00:00.000Z") } },
    ]);
    const engagement = await getEngagement("tenant_1", IST, now);
    expect(engagement.weeklyAttendance.at(-1)!.records).toEqual([{ present: true }]);
    expect(engagement.weeklyAttendance[4].records).toEqual([{ present: false }]);
  });

  it("reports scheduled duration, the only duration this schema stores", async () => {
    sessionFindMany.mockResolvedValue([{ durationMins: 60 }, { durationMins: 90 }]);
    const engagement = await getEngagement("tenant_1", IST, now);
    expect(engagement.durations).toEqual([60, 90]);
  });
});

describe("getUpcomingSessions", () => {
  it("looks seven days ahead and skips cancelled classes", async () => {
    await getUpcomingSessions("tenant_1", now);
    const args = sessionFindMany.mock.calls[0][0];
    expect(args.where.tenantId).toBe("tenant_1");
    expect(args.where.status).toEqual({ not: "CANCELLED" });
    const horizon = (args.where.scheduledAtUtc as { lt: Date }).lt;
    expect(Math.round((horizon.getTime() - now.getTime()) / 86_400_000)).toBe(7);
    expect(args.orderBy).toEqual({ scheduledAtUtc: "asc" });
  });
});
