import { describe, expect, it, vi, beforeEach } from "vitest";

const liveSessionCreate = vi.fn();
const liveSessionUpdate = vi.fn();
const liveSessionFindMany = vi.fn();

const tx = {
  liveSession: {
    create: (...a: unknown[]) => liveSessionCreate(...a),
    update: (...a: unknown[]) => liveSessionUpdate(...a),
  },
};

vi.mock("@chessplay-clone/db", () => ({
  prisma: {
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    liveSession: { findMany: (...a: unknown[]) => liveSessionFindMany(...a) },
  },
}));

const { createLiveSession, listUpcomingSessionsForClassrooms } = await import(
  "./liveSessionRepository"
);

beforeEach(() => {
  liveSessionCreate.mockReset();
  liveSessionUpdate.mockReset();
  liveSessionFindMany.mockReset();
  liveSessionCreate.mockResolvedValue({ id: "ls_1" });
  liveSessionUpdate.mockResolvedValue({ id: "ls_1" });
  liveSessionFindMany.mockResolvedValue([]);
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
