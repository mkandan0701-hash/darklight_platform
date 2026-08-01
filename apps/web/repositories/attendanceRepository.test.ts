import { describe, expect, it, vi, beforeEach } from "vitest";

const findMany = vi.fn();
const createMany = vi.fn();
const updateMany = vi.fn();
const upsert = vi.fn();
const classroomFindFirst = vi.fn();
const classroomStudentFindMany = vi.fn();

const tx = {
  attendanceRecord: {
    findMany: (...a: unknown[]) => findMany(...a),
    createMany: (...a: unknown[]) => createMany(...a),
    updateMany: (...a: unknown[]) => updateMany(...a),
    upsert: (...a: unknown[]) => upsert(...a),
  },
};

vi.mock("@chessplay-clone/db", () => ({
  prisma: {
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    attendanceRecord: {
      findMany: (...a: unknown[]) => findMany(...a),
      upsert: (...a: unknown[]) => upsert(...a),
    },
    classroom: { findFirst: (...a: unknown[]) => classroomFindFirst(...a) },
    classroomStudent: { findMany: (...a: unknown[]) => classroomStudentFindMany(...a) },
  },
}));

const {
  markAttendance,
  getAttendanceForSession,
  getClassroomAttendanceReport,
  getStudentAttendanceSummary,
} = await import("./attendanceRepository");

const JAN = new Date("2026-01-10T10:00:00.000Z");
const FEB = new Date("2026-02-10T10:00:00.000Z");

beforeEach(() => {
  [findMany, createMany, updateMany, upsert, classroomFindFirst, classroomStudentFindMany].forEach(
    (m) => m.mockReset()
  );
  findMany.mockResolvedValue([]);
  createMany.mockResolvedValue({ count: 0 });
  updateMany.mockResolvedValue({ count: 0 });
});

describe("markAttendance", () => {
  // Regression guard for the trap this repository exists to avoid: an upsert
  // keyed on @@unique([liveSessionId, studentId]) has no top-level tenantId in
  // its where, so tenantScope refuses it and the call throws at runtime.
  it("never uses upsert", async () => {
    findMany.mockResolvedValue([{ studentId: "stu_1" }]);
    await markAttendance("tenant_1", "ls_1", [
      { studentId: "stu_1", present: true, mode: "ONLINE" },
      { studentId: "stu_2", present: false, mode: "OFFLINE" },
    ]);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("creates rows for students not yet marked, with tenantId on every item", async () => {
    findMany.mockResolvedValue([]);
    await markAttendance("tenant_1", "ls_1", [
      { studentId: "stu_1", present: true, mode: "ONLINE" },
      { studentId: "stu_2", present: false, mode: "OFFLINE" },
    ]);

    const [args] = createMany.mock.calls[0] as [{ data: Record<string, unknown>[] }];
    expect(args.data).toHaveLength(2);
    expect(args.data.every((row) => row.tenantId === "tenant_1")).toBe(true);
    expect(args.data.every((row) => row.liveSessionId === "ls_1")).toBe(true);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("updates students already marked instead of inserting a duplicate", async () => {
    findMany.mockResolvedValue([{ studentId: "stu_1" }]);
    await markAttendance("tenant_1", "ls_1", [
      { studentId: "stu_1", present: false, mode: "OFFLINE" },
    ]);

    expect(createMany).not.toHaveBeenCalled();
    const [args] = updateMany.mock.calls[0] as [
      { where: Record<string, any>; data: Record<string, unknown> }
    ];
    expect(args.where.tenantId).toBe("tenant_1");
    expect(args.where.liveSessionId).toBe("ls_1");
    expect(args.where.studentId).toEqual({ in: ["stu_1"] });
    expect(args.data).toMatchObject({ present: false, mode: "OFFLINE" });
  });

  // A roster of any size costs at most four updates, one per (present, mode).
  it("groups updates by present/mode rather than one call per student", async () => {
    findMany.mockResolvedValue([
      { studentId: "a" },
      { studentId: "b" },
      { studentId: "c" },
      { studentId: "d" },
    ]);
    await markAttendance("tenant_1", "ls_1", [
      { studentId: "a", present: true, mode: "ONLINE" },
      { studentId: "b", present: true, mode: "ONLINE" },
      { studentId: "c", present: true, mode: "ONLINE" },
      { studentId: "d", present: false, mode: "OFFLINE" },
    ]);

    expect(updateMany).toHaveBeenCalledTimes(2);
    const groups = updateMany.mock.calls.map(([a]: any) => a.where.studentId.in);
    expect(groups).toContainEqual(["a", "b", "c"]);
    expect(groups).toContainEqual(["d"]);
  });

  it("does nothing at all for an empty roster", async () => {
    await markAttendance("tenant_1", "ls_1", []);
    expect(findMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });
});

describe("getAttendanceForSession", () => {
  it("scopes by tenant", async () => {
    await getAttendanceForSession("tenant_1", "ls_1");
    const [args] = findMany.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(args.where).toMatchObject({ tenantId: "tenant_1", liveSessionId: "ls_1" });
  });
});

describe("getClassroomAttendanceReport", () => {
  function rosterOf(students: { studentId: string; email: string; enrolledAt: Date }[]) {
    return {
      students: students.map((s) => ({
        studentId: s.studentId,
        enrolledAt: s.enrolledAt,
        student: { user: { email: s.email } },
      })),
    };
  }

  it("returns null when the classroom isn't in this tenant", async () => {
    classroomFindFirst.mockResolvedValue(null);
    expect(await getClassroomAttendanceReport("tenant_1", "c_1")).toBeNull();
  });

  it("scopes both queries by tenant", async () => {
    classroomFindFirst.mockResolvedValue(rosterOf([]));
    await getClassroomAttendanceReport("tenant_1", "c_1");

    const [classroomArgs] = classroomFindFirst.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(classroomArgs.where).toMatchObject({ id: "c_1", tenantId: "tenant_1" });
    const [recordArgs] = findMany.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(recordArgs.where).toMatchObject({ tenantId: "tenant_1" });
  });

  // The roster is the row source, so someone who has never been marked still
  // appears rather than silently dropping out of the report.
  it("includes a student with no records at all", async () => {
    classroomFindFirst.mockResolvedValue(
      rosterOf([{ studentId: "stu_1", email: "a@x.test", enrolledAt: JAN }])
    );
    findMany.mockResolvedValue([]);

    expect(await getClassroomAttendanceReport("tenant_1", "c_1")).toEqual([
      { studentId: "stu_1", email: "a@x.test", attendedCount: 0, sessionCount: 0 },
    ]);
  });

  it("counts a marked session for everyone on the roster, present or not", async () => {
    classroomFindFirst.mockResolvedValue(
      rosterOf([
        { studentId: "stu_1", email: "a@x.test", enrolledAt: JAN },
        { studentId: "stu_2", email: "b@x.test", enrolledAt: JAN },
      ])
    );
    // Only stu_1 was present, but the session is marked, so it counts for both.
    findMany.mockResolvedValue([
      { liveSessionId: "s1", studentId: "stu_1", present: true, liveSession: { scheduledAtUtc: JAN } },
      { liveSessionId: "s1", studentId: "stu_2", present: false, liveSession: { scheduledAtUtc: JAN } },
    ]);

    const report = await getClassroomAttendanceReport("tenant_1", "c_1");
    expect(report).toEqual([
      { studentId: "stu_1", email: "a@x.test", attendedCount: 1, sessionCount: 1 },
      { studentId: "stu_2", email: "b@x.test", attendedCount: 0, sessionCount: 1 },
    ]);
  });

  it("does not hold a mid-term joiner responsible for earlier sessions", async () => {
    classroomFindFirst.mockResolvedValue(
      rosterOf([
        { studentId: "old", email: "old@x.test", enrolledAt: JAN },
        { studentId: "new", email: "new@x.test", enrolledAt: FEB },
      ])
    );
    findMany.mockResolvedValue([
      { liveSessionId: "s_jan", studentId: "old", present: true, liveSession: { scheduledAtUtc: JAN } },
      { liveSessionId: "s_feb", studentId: "old", present: true, liveSession: { scheduledAtUtc: FEB } },
      { liveSessionId: "s_feb", studentId: "new", present: true, liveSession: { scheduledAtUtc: FEB } },
    ]);

    const report = await getClassroomAttendanceReport("tenant_1", "c_1");
    expect(report).toEqual([
      { studentId: "old", email: "old@x.test", attendedCount: 2, sessionCount: 2 },
      // Not 1 of 2 — the January class happened before they joined.
      { studentId: "new", email: "new@x.test", attendedCount: 1, sessionCount: 1 },
    ]);
  });
});

describe("getStudentAttendanceSummary", () => {
  it("returns zeroes without querying records when not enrolled anywhere", async () => {
    classroomStudentFindMany.mockResolvedValue([]);
    expect(await getStudentAttendanceSummary("tenant_1", "stu_1")).toEqual({
      attendedCount: 0,
      sessionCount: 0,
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  // Each classroom counts from its own enrolment date, then sums.
  it("judges each classroom against its own enrolment date", async () => {
    classroomStudentFindMany.mockResolvedValue([
      { classroomId: "c_old", enrolledAt: JAN },
      { classroomId: "c_new", enrolledAt: FEB },
    ]);
    findMany.mockResolvedValue([
      {
        liveSessionId: "s1",
        studentId: "stu_1",
        present: true,
        liveSession: { scheduledAtUtc: JAN, classroomId: "c_old" },
      },
      // Held in January but belongs to the class joined in February.
      {
        liveSessionId: "s2",
        studentId: "stu_1",
        present: false,
        liveSession: { scheduledAtUtc: JAN, classroomId: "c_new" },
      },
      {
        liveSessionId: "s3",
        studentId: "stu_1",
        present: true,
        liveSession: { scheduledAtUtc: FEB, classroomId: "c_new" },
      },
    ]);

    expect(await getStudentAttendanceSummary("tenant_1", "stu_1")).toEqual({
      attendedCount: 2,
      sessionCount: 2,
    });
  });
});
