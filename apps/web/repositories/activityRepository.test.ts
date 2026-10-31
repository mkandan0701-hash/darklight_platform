import { beforeEach, describe, expect, it, vi } from "vitest";

const classroomFindMany = vi.fn();
const userFindMany = vi.fn();
const assignmentFindMany = vi.fn();
const attendanceFindMany = vi.fn();
const invoiceFindMany = vi.fn();
const certificateFindMany = vi.fn();
const ratingFindMany = vi.fn();

vi.mock("@chessplay-clone/db", () => ({
  prisma: {
    classroom: { findMany: (...a: unknown[]) => classroomFindMany(...a) },
    user: { findMany: (...a: unknown[]) => userFindMany(...a) },
    assignment: { findMany: (...a: unknown[]) => assignmentFindMany(...a) },
    attendanceRecord: { findMany: (...a: unknown[]) => attendanceFindMany(...a) },
    invoice: { findMany: (...a: unknown[]) => invoiceFindMany(...a) },
    certificate: { findMany: (...a: unknown[]) => certificateFindMany(...a) },
    ratingRecord: { findMany: (...a: unknown[]) => ratingFindMany(...a) },
  },
}));

const { ACTIVITY_VERB, getRecentActivity } = await import("./activityRepository");

const all = [
  classroomFindMany,
  userFindMany,
  assignmentFindMany,
  attendanceFindMany,
  invoiceFindMany,
  certificateFindMany,
  ratingFindMany,
];

const at = (iso: string) => new Date(iso);

beforeEach(() => {
  all.forEach((m) => {
    m.mockReset();
    m.mockResolvedValue([]);
  });
});

describe("tenant scoping", () => {
  it("scopes every source to the academy", async () => {
    await getRecentActivity("tenant_1");
    for (const mock of all) {
      const where = (mock.mock.calls[0][0] as { where: { tenantId: string } }).where;
      expect(where.tenantId).toBe("tenant_1");
    }
  });

  it("leaves out deleted classrooms and deactivated accounts", async () => {
    await getRecentActivity("tenant_1");
    expect(classroomFindMany.mock.calls[0][0].where).toMatchObject({ deletedAt: null });
    expect(userFindMany.mock.calls[0][0].where).toMatchObject({ role: "STUDENT", deletedAt: null });
  });
});

describe("merging", () => {
  it("orders strictly newest-first across every source", async () => {
    classroomFindMany.mockResolvedValue([
      { id: "c1", name: "Rooks", createdAt: at("2026-10-01T10:00:00Z") },
    ]);
    userFindMany.mockResolvedValue([
      { id: "u1", email: "a@x.test", displayName: "Ana", createdAt: at("2026-10-05T10:00:00Z") },
    ]);
    certificateFindMany.mockResolvedValue([
      {
        id: "cert1",
        issuedAtUtc: at("2026-10-03T10:00:00Z"),
        issuedBy: { email: "coach@x.test", displayName: "Coach" },
        student: { user: { email: "a@x.test", displayName: "Ana" } },
      },
    ]);

    const feed = await getRecentActivity("tenant_1");
    expect(feed.map((e) => e.kind)).toEqual([
      "student-joined",
      "certificate-issued",
      "classroom-created",
    ]);
    for (let i = 1; i < feed.length; i++) {
      expect(feed[i - 1].at.getTime()).toBeGreaterThanOrEqual(feed[i].at.getTime());
    }
  });

  it("honours the requested length", async () => {
    userFindMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        id: `u${i}`,
        email: `u${i}@x.test`,
        displayName: null,
        createdAt: at(`2026-10-${String(i + 1).padStart(2, "0")}T10:00:00Z`),
      }))
    );
    expect(await getRecentActivity("tenant_1", 3)).toHaveLength(3);
  });
});

describe("attribution", () => {
  // Only three sources record who acted. Putting a plausible name on the other
  // four would be a fabricated audit trail, which is worse than a blank.
  it("leaves the actor null where the row does not record one", async () => {
    classroomFindMany.mockResolvedValue([
      { id: "c1", name: "Rooks", createdAt: at("2026-10-01T10:00:00Z") },
    ]);
    attendanceFindMany.mockResolvedValue([
      {
        id: "a1",
        markedAtUtc: at("2026-10-02T10:00:00Z"),
        liveSessionId: "s1",
        liveSession: { classroom: { name: "Rooks" } },
      },
    ]);

    const feed = await getRecentActivity("tenant_1");
    expect(feed.every((e) => e.actor === null)).toBe(true);
    expect(feed.map((e) => e.subject)).toEqual(["Rooks", "Rooks"]);
  });

  it("names the actor where the row does record one", async () => {
    ratingFindMany.mockResolvedValue([
      {
        id: "r1",
        recordedAtUtc: at("2026-10-02T10:00:00Z"),
        federation: "FIDE",
        rating: 1620,
        recordedBy: { email: "coach@x.test", displayName: "Coach Rao" },
        student: { user: { email: "a@x.test", displayName: "Ana" } },
      },
    ]);
    const [entry] = await getRecentActivity("tenant_1");
    expect(entry.actor).toBe("Coach Rao");
    expect(entry.subject).toBe("Ana · FIDE 1620");
  });
});

describe("attendance collapsing", () => {
  // A coach marking a register of twenty students writes twenty rows in one
  // action. Without collapsing, that single act buries every other event.
  it("emits one entry per session, not per student marked", async () => {
    attendanceFindMany.mockResolvedValue([
      { id: "a1", markedAtUtc: at("2026-10-02T10:00:03Z"), liveSessionId: "s1", liveSession: { classroom: { name: "Rooks" } } },
      { id: "a2", markedAtUtc: at("2026-10-02T10:00:02Z"), liveSessionId: "s1", liveSession: { classroom: { name: "Rooks" } } },
      { id: "a3", markedAtUtc: at("2026-10-02T10:00:01Z"), liveSessionId: "s1", liveSession: { classroom: { name: "Rooks" } } },
      { id: "a4", markedAtUtc: at("2026-10-01T10:00:00Z"), liveSessionId: "s2", liveSession: { classroom: { name: "Knights" } } },
    ]);

    const feed = await getRecentActivity("tenant_1");
    expect(feed).toHaveLength(2);
    expect(feed.map((e) => e.id)).toEqual(["attendance:s1", "attendance:s2"]);
  });
});

describe("invoices", () => {
  it("reports only invoices that were actually paid", async () => {
    await getRecentActivity("tenant_1");
    expect(invoiceFindMany.mock.calls[0][0].where).toMatchObject({
      status: "PAID",
      paidAtUtc: { not: null },
    });
  });
});

describe("verbs", () => {
  it("names every kind the feed can emit", async () => {
    const kinds = [
      "classroom-created",
      "student-joined",
      "homework-assigned",
      "attendance-marked",
      "invoice-paid",
      "certificate-issued",
      "rating-recorded",
    ] as const;
    for (const kind of kinds) {
      expect(ACTIVITY_VERB[kind]).toBeTruthy();
    }
    expect(Object.keys(ACTIVITY_VERB)).toHaveLength(kinds.length);
  });
});
