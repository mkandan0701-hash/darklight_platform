import { describe, expect, it, vi, beforeEach } from "vitest";

const liveSessionCreate = vi.fn();
const liveSessionUpdate = vi.fn();
const liveSessionFindMany = vi.fn();
const liveSessionFindFirst = vi.fn();
const liveSessionUpdateMany = vi.fn();

const tx = {
  liveSession: {
    create: (...a: unknown[]) => liveSessionCreate(...a),
    update: (...a: unknown[]) => liveSessionUpdate(...a),
  },
};

vi.mock("@chessplay-clone/db", () => ({
  prisma: {
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    liveSession: {
      findMany: (...a: unknown[]) => liveSessionFindMany(...a),
      findFirst: (...a: unknown[]) => liveSessionFindFirst(...a),
      updateMany: (...a: unknown[]) => liveSessionUpdateMany(...a),
    },
  },
}));

// visibleClassroomWhere is deliberately the real one, not a mock: the point of
// these cases is that the session read composes the *same* rule the classroom
// read enforces, so stubbing it would assert nothing.
const {
  createLiveSession,
  listUpcomingSessionsForClassrooms,
  getLiveSessionForViewer,
  listBoardSessionsForViewer,
  markSessionStarted,
} =
  await import("./liveSessionRepository");

beforeEach(() => {
  liveSessionCreate.mockReset();
  liveSessionUpdate.mockReset();
  liveSessionFindMany.mockReset();
  liveSessionFindFirst.mockReset();
  liveSessionCreate.mockResolvedValue({ id: "ls_1" });
  liveSessionUpdate.mockResolvedValue({ id: "ls_1" });
  liveSessionFindMany.mockResolvedValue([]);
  liveSessionFindFirst.mockResolvedValue(null);
  liveSessionUpdateMany.mockReset();
  liveSessionUpdateMany.mockResolvedValue({ count: 1 });
});

describe("createLiveSession", () => {
  // Regression: the follow-up update filtered on `id` alone. tenantScope
  // guards `update` on every tenant-scoped model and refuses a where without
  // tenantId in *both* modes, so this threw every time it ran — scheduling a
  // live session never worked, from the form or from a script.
  it("scopes the socketRoomId back-fill by tenantId", async () => {
    await createLiveSession({
      tenantId: "tenant_1",
      classroomId: "classroom_1",
      scheduledAtUtc: new Date("2026-08-03T10:00:00.000Z"),
      durationMins: 60,
    });

    expect(liveSessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ls_1", tenantId: "tenant_1" },
        data: { socketRoomId: "ls_1" },
      })
    );
  });

  it("sets tenantId on the insert too", async () => {
    await createLiveSession({
      tenantId: "tenant_1",
      classroomId: "classroom_1",
      scheduledAtUtc: new Date("2026-08-03T10:00:00.000Z"),
      durationMins: 60,
    });

    const [args] = liveSessionCreate.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(args.data.tenantId).toBe("tenant_1");
    expect(args.data.socketRoomId).toEqual(expect.any(String));
  });
});

// The bug: the live session page read by id with a tenant filter only, so any
// signed-in member of the academy could load any session's page. The socket's
// canAccessLiveSession still refused the board, so what leaked was the
// scheduled time and duration — plus a page that looks like it should work.
describe("getLiveSessionForViewer", () => {
  const viewer = (role: string) => ({ tenantId: "tenant_1", id: "user_1", role: role as never });

  function whereOf() {
    const [args] = liveSessionFindFirst.mock.calls[0] as [{ where: Record<string, any> }];
    return args.where;
  }

  it("scopes by tenant and id", async () => {
    await getLiveSessionForViewer(viewer("COACH"), "ls_1");
    expect(whereOf()).toMatchObject({ id: "ls_1", tenantId: "tenant_1" });
  });

  it("requires the viewer to be in the session's classroom", async () => {
    await getLiveSessionForViewer(viewer("STUDENT"), "ls_1");
    expect(whereOf().classroom).toEqual({
      deletedAt: null,
      students: { some: { student: { userId: "user_1" } } },
    });
  });

  // An admin sees the whole academy, but a deleted classroom is still gone —
  // that half of the filter is not role-dependent.
  it("still excludes a soft-deleted classroom for an ACADEMY_ADMIN", async () => {
    await getLiveSessionForViewer(viewer("ACADEMY_ADMIN"), "ls_1");
    expect(whereOf().classroom).toEqual({ deletedAt: null });
  });

  it("never issues a query with no classroom filter at all", async () => {
    for (const role of ["ACADEMY_ADMIN", "COACH", "STUDENT", "PARENT"]) {
      liveSessionFindFirst.mockClear();
      await getLiveSessionForViewer(viewer(role), "ls_1");
      expect(whereOf().classroom, `${role} has no classroom filter`).toBeDefined();
    }
  });

  it("returns null for a session the viewer cannot reach", async () => {
    liveSessionFindFirst.mockResolvedValue(null);
    expect(await getLiveSessionForViewer(viewer("PARENT"), "someone_elses")).toBeNull();
  });
});

describe("listUpcomingSessionsForClassrooms", () => {
  it("returns nothing without querying when the person has no classrooms", async () => {
    // `classroomId: { in: [] }` would match no rows anyway, but skipping the
    // round trip keeps an empty dashboard from hitting Postgres.
    expect(await listUpcomingSessionsForClassrooms("tenant_1", [], 5)).toEqual([]);
    expect(liveSessionFindMany).not.toHaveBeenCalled();
  });

  it("filters by tenant, restricts to the given classrooms, and only looks forward", async () => {
    await listUpcomingSessionsForClassrooms("tenant_1", ["c1", "c2"], 5);

    const [args] = liveSessionFindMany.mock.calls[0] as [
      { where: Record<string, any>; take: number; orderBy: unknown }
    ];
    expect(args.where.tenantId).toBe("tenant_1");
    expect(args.where.classroomId).toEqual({ in: ["c1", "c2"] });
    expect(args.where.scheduledAtUtc.gte).toBeInstanceOf(Date);
    expect(args.take).toBe(5);
    expect(args.orderBy).toEqual({ scheduledAtUtc: "asc" });
  });
});

describe("listBoardSessionsForViewer", () => {
  const NOW = new Date("2026-08-05T12:00:00.000Z");
  const boardViewer = (role: string) => ({
    tenantId: "tenant_1",
    id: "user_1",
    role: role as "COACH" | "STUDENT" | "PARENT" | "ACADEMY_ADMIN",
  });
  const row = (id: string, scheduledAtUtc: string, extra: Record<string, unknown> = {}) => ({
    id,
    scheduledAtUtc: new Date(scheduledAtUtc),
    durationMins: 60,
    status: "SCHEDULED",
    startedAtUtc: null,
    _count: { attendance: 0 },
    ...extra,
  });
  const whereOf = () =>
    (liveSessionFindMany.mock.calls[0] as [{ where: Record<string, unknown> }])[0].where;

  it("composes the classroom membership rule and drops cancelled sessions", async () => {
    await listBoardSessionsForViewer(boardViewer("STUDENT"), { bucket: "UPCOMING" }, NOW);
    const where = whereOf();
    expect(where.tenantId).toBe("tenant_1");
    expect(where.status).toEqual({ not: "CANCELLED" });
    const classroom = where.classroom as { AND: unknown[] };
    expect(classroom.AND[0]).toEqual({
      deletedAt: null,
      students: { some: { student: { userId: "user_1" } } },
    });
  });

  it("adds filters on top of membership, never in place of it", async () => {
    await listBoardSessionsForViewer(
      boardViewer("COACH"),
      { bucket: "UPCOMING", q: "yuvik", coachProfileId: "coach_9", classroomId: "c_1" },
      NOW
    );
    const where = whereOf();
    const classroom = where.classroom as { AND: unknown[] };
    expect(classroom.AND).toHaveLength(3);
    expect(classroom.AND[0]).toMatchObject({ coaches: { some: { coach: { userId: "user_1" } } } });
    expect(where.classroomId).toBe("c_1");
  });

  it("keeps only rows that are really in the requested tab", async () => {
    liveSessionFindMany.mockResolvedValue([
      // Ended an hour ago, never started → delayed.
      row("delayed", "2026-08-05T10:00:00.000Z"),
      // Ended an hour ago but attendance was marked → completed, not delayed.
      row("held", "2026-08-05T10:00:00.000Z", { _count: { attendance: 3 } }),
    ]);
    const result = await listBoardSessionsForViewer(boardViewer("COACH"), { bucket: "DELAYED" }, NOW);
    expect(result.map((r) => r.id)).toEqual(["delayed"]);
  });

  it("only asks Postgres for unstarted sessions on the delayed tab", async () => {
    await listBoardSessionsForViewer(boardViewer("COACH"), { bucket: "DELAYED" }, NOW);
    expect(whereOf().startedAtUtc).toBeNull();
  });
});

describe("markSessionStarted", () => {
  it("only writes a session that hasn't been started, so the first start time sticks", async () => {
    const at = new Date("2026-08-05T10:01:00.000Z");
    await markSessionStarted("tenant_1", "ls_1", at);
    expect(liveSessionUpdateMany).toHaveBeenCalledWith({
      where: { id: "ls_1", tenantId: "tenant_1", startedAtUtc: null },
      data: { startedAtUtc: at },
    });
  });
});
