import { beforeEach, describe, expect, it, vi } from "vitest";

const xpCreateMany = vi.fn();
const xpFindMany = vi.fn();
const badgeCreateMany = vi.fn();
const badgeFindMany = vi.fn();
const classroomStudentFindMany = vi.fn();

vi.mock("@chessplay-clone/db", () => ({
  prisma: {
    xpEvent: {
      createMany: (...a: unknown[]) => xpCreateMany(...a),
      findMany: (...a: unknown[]) => xpFindMany(...a),
    },
    studentBadge: {
      createMany: (...a: unknown[]) => badgeCreateMany(...a),
      findMany: (...a: unknown[]) => badgeFindMany(...a),
    },
    classroomStudent: { findMany: (...a: unknown[]) => classroomStudentFindMany(...a) },
  },
}));

const { awardXp, awardXpSafely, getClassroomLeaderboard, getStudentProgress } = await import(
  "./gamificationRepository"
);

const input = {
  tenantId: "tenant_1",
  studentId: "stu_1",
  kind: "PUZZLE_SOLVED" as const,
  sourceId: "puzzle_1",
};

beforeEach(() => {
  [xpCreateMany, xpFindMany, badgeCreateMany, badgeFindMany, classroomStudentFindMany].forEach(
    (m) => m.mockReset()
  );
  xpCreateMany.mockResolvedValue({ count: 1 });
  xpFindMany.mockResolvedValue([]);
  badgeCreateMany.mockResolvedValue({ count: 0 });
  badgeFindMany.mockResolvedValue([]);
  classroomStudentFindMany.mockResolvedValue([]);
});

describe("awardXp", () => {
  it("writes the event tenant-scoped, at the rate for its kind", async () => {
    await awardXp(input);
    const args = xpCreateMany.mock.calls[0][0];
    expect(args.data[0]).toMatchObject({
      tenantId: "tenant_1",
      studentId: "stu_1",
      kind: "PUZZLE_SOLVED",
      sourceId: "puzzle_1",
      points: 10,
    });
  });

  // Without this a student could re-solve a puzzle they already cracked and
  // farm XP off it — every attempt is logged, so the submissions are real.
  it("relies on skipDuplicates so the same source pays out once", async () => {
    await awardXp(input);
    expect(xpCreateMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  it("reports no award, and grants no badges, when the event already existed", async () => {
    xpCreateMany.mockResolvedValue({ count: 0 });
    expect(await awardXp(input)).toEqual({ awarded: false });
    expect(badgeCreateMany).not.toHaveBeenCalled();
  });

  it("grants the badges the new total unlocks", async () => {
    xpFindMany.mockResolvedValue(Array.from({ length: 10 }, () => ({ kind: "PUZZLE_SOLVED" })));
    await awardXp(input);
    const codes = badgeCreateMany.mock.calls[0][0].data.map((b: { code: string }) => b.code);
    expect(codes).toEqual(["FIRST_PUZZLE", "PUZZLE_10"]);
    // Re-asserting the whole earned set every time is only safe because the
    // unique on [studentId, code] makes a re-grant a no-op.
    expect(badgeCreateMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });
});

describe("awardXpSafely", () => {
  // XP is a garnish on the action that earned it. A gamification outage must
  // not cost a student the puzzle attempt they just submitted.
  it("swallows a failure rather than failing the action that earned it", async () => {
    xpCreateMany.mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(awardXpSafely(input)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("getStudentProgress", () => {
  it("totals XP and counts each kind separately", async () => {
    xpFindMany.mockResolvedValue([
      { kind: "PUZZLE_SOLVED", points: 10 },
      { kind: "PUZZLE_SOLVED", points: 10 },
      { kind: "SESSION_ATTENDED", points: 25 },
    ]);
    const progress = await getStudentProgress("tenant_1", "stu_1");
    expect(progress).toMatchObject({ xp: 45, puzzlesSolved: 2, classesAttended: 1 });
  });
});

describe("getClassroomLeaderboard", () => {
  it("ranks only the students enrolled in that classroom, highest first", async () => {
    classroomStudentFindMany.mockResolvedValue([
      { studentId: "s1", student: { user: { email: "a@x.test", displayName: "A" } } },
      { studentId: "s2", student: { user: { email: "b@x.test", displayName: "B" } } },
    ]);
    xpFindMany.mockResolvedValue([
      { studentId: "s1", points: 10 },
      { studentId: "s2", points: 25 },
      { studentId: "s2", points: 10 },
    ]);

    const board = await getClassroomLeaderboard("tenant_1", "class_1");
    expect(board.map((r) => [r.studentId, r.xp])).toEqual([
      ["s2", 35],
      ["s1", 10],
    ]);
    // Scoped to this classroom's roster, never the whole academy (claude.md §9).
    expect(xpFindMany.mock.calls[0][0].where).toMatchObject({
      tenantId: "tenant_1",
      studentId: { in: ["s1", "s2"] },
    });
  });

  it("shows an enrolled student who has earned nothing yet, at zero", async () => {
    classroomStudentFindMany.mockResolvedValue([
      { studentId: "s1", student: { user: { email: "a@x.test", displayName: "A" } } },
    ]);
    xpFindMany.mockResolvedValue([]);
    expect(await getClassroomLeaderboard("tenant_1", "class_1")).toEqual([
      {
        studentId: "s1",
        user: { email: "a@x.test", displayName: "A" },
        xp: 0,
        puzzlesSolved: 0,
        classesAttended: 0,
        badges: 0,
        rank: null,
      },
    ]);
  });

  it("counts only XP awarded inside the period, with a per-kind breakdown and badges", async () => {
    classroomStudentFindMany.mockResolvedValue([
      { studentId: "s1", student: { user: { email: "a@x.test", displayName: "A" } } },
    ]);
    xpFindMany.mockResolvedValue([
      { studentId: "s1", points: 10, kind: "PUZZLE_SOLVED" },
      { studentId: "s1", points: 25, kind: "SESSION_ATTENDED" },
    ]);
    badgeFindMany.mockResolvedValue([{ studentId: "s1" }, { studentId: "s1" }]);
    const period = { start: new Date("2026-10-12T00:00:00Z"), end: new Date("2026-10-19T00:00:00Z") };

    const [row] = await getClassroomLeaderboard("tenant_1", "class_1", period);
    expect(xpFindMany.mock.calls[0][0].where).toMatchObject({
      tenantId: "tenant_1",
      awardedAtUtc: { gte: period.start, lt: period.end },
    });
    expect(row).toMatchObject({ xp: 35, puzzlesSolved: 1, classesAttended: 1, badges: 2, rank: 1 });
  });

  it("does not query events at all for an empty classroom", async () => {
    classroomStudentFindMany.mockResolvedValue([]);
    expect(await getClassroomLeaderboard("tenant_1", "class_1")).toEqual([]);
    expect(xpFindMany).not.toHaveBeenCalled();
  });
});
