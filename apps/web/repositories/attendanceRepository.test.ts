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
  getStudentAttendanceDetail,
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

// The parent-facing table. Its rows and getStudentAttendanceSummary's two
// integers are the same facts at two zoom levels, so the tests that matter are
// the ones proving they can't tell a parent different stories.
describe("getStudentAttendanceDetail", () => {
  const MAR = new Date("2026-03-10T10:00:00.000Z");

  function record(sessionId: string, classroomId: string, at: Date, studentId: string, present: boolean) {
    return {
      liveSessionId: sessionId,
      studentId,
      present,
      liveSession: { scheduledAtUtc: at, classroomId },
    };
  }

  it("returns nothing, and never queries records, for a student with no enrolments", async () => {
    classroomStudentFindMany.mockResolvedValue([]);
    expect(await getStudentAttendanceDetail("tenant_1", "stu_1", 20)).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("scopes both queries by tenant", async () => {
    classroomStudentFindMany.mockResolvedValue([
      { classroomId: "c_1", enrolledAt: JAN, classroom: { name: "Sunday Squad" } },
    ]);
    findMany.mockResolvedValue([]);

    await getStudentAttendanceDetail("tenant_1", "stu_1", 20);

    expect(classroomStudentFindMany.mock.calls[0][0].where).toMatchObject({ tenantId: "tenant_1" });
    expect(findMany.mock.calls[0][0].where).toMatchObject({ tenantId: "tenant_1" });
  });

  // A student who joined in February is not absent from January's classes.
  it("judges each classroom against its own enrolment date", async () => {
    classroomStudentFindMany.mockResolvedValue([
      { classroomId: "c_1", enrolledAt: FEB, classroom: { name: "Sunday Squad" } },
    ]);
    findMany.mockResolvedValue([
      record("ls_jan", "c_1", JAN, "stu_1", false),
      record("ls_mar", "c_1", MAR, "stu_1", true),
    ]);

    const rows = await getStudentAttendanceDetail("tenant_1", "stu_1", 20);

    expect(rows.map((r) => r.liveSessionId)).toEqual(["ls_mar"]);
  });

  // eligibleSessions sorts within one classroom, so a per-classroom sort alone
  // passes a single-classroom fixture and quietly breaks here — `take` would
  // keep the oldest rows of the first classroom rather than the newest overall.
  it("orders newest first across two classrooms, not just within each", async () => {
    classroomStudentFindMany.mockResolvedValue([
      { classroomId: "c_1", enrolledAt: JAN, classroom: { name: "Sunday Squad" } },
      { classroomId: "c_2", enrolledAt: JAN, classroom: { name: "Advanced" } },
    ]);
    findMany.mockResolvedValue([
      record("ls_jan", "c_1", JAN, "stu_1", true),
      record("ls_mar", "c_1", MAR, "stu_1", true),
      record("ls_feb", "c_2", FEB, "stu_1", true),
    ]);

    const rows = await getStudentAttendanceDetail("tenant_1", "stu_1", 20);

    expect(rows.map((r) => r.liveSessionId)).toEqual(["ls_mar", "ls_feb", "ls_jan"]);
  });

  it("keeps the most recent rows when take is smaller than the history", async () => {
    classroomStudentFindMany.mockResolvedValue([
      { classroomId: "c_1", enrolledAt: JAN, classroom: { name: "Sunday Squad" } },
      { classroomId: "c_2", enrolledAt: JAN, classroom: { name: "Advanced" } },
    ]);
    findMany.mockResolvedValue([
      record("ls_jan", "c_1", JAN, "stu_1", true),
      record("ls_mar", "c_1", MAR, "stu_1", true),
      record("ls_feb", "c_2", FEB, "stu_1", true),
    ]);

    const rows = await getStudentAttendanceDetail("tenant_1", "stu_1", 2);

    expect(rows.map((r) => r.liveSessionId)).toEqual(["ls_mar", "ls_feb"]);
  });

  it("carries the classroom name so a row says which class it was", async () => {
    classroomStudentFindMany.mockResolvedValue([
      { classroomId: "c_1", enrolledAt: JAN, classroom: { name: "Sunday Squad" } },
    ]);
    findMany.mockResolvedValue([record("ls_1", "c_1", MAR, "stu_1", true)]);

    const [row] = await getStudentAttendanceDetail("tenant_1", "stu_1", 20);

    expect(row).toMatchObject({ classroomId: "c_1", classroomName: "Sunday Squad" });
  });

  // Both read `present: false`, and both count as a non-attendance, but only
  // one of them means the coach wrote "absent" next to this child's name.
  it("distinguishes a marked absence from a session this child was never recorded for", async () => {
    classroomStudentFindMany.mockResolvedValue([
      { classroomId: "c_1", enrolledAt: JAN, classroom: { name: "Sunday Squad" } },
    ]);
    findMany.mockResolvedValue([
      // ls_absent: this child has a row saying absent.
      record("ls_absent", "c_1", MAR, "stu_1", false),
      // ls_other: the class was marked, but only for a classmate.
      record("ls_other", "c_1", FEB, "stu_2", true),
    ]);

    const rows = await getStudentAttendanceDetail("tenant_1", "stu_1", 20);
    const byId = new Map(rows.map((r) => [r.liveSessionId, r]));

    expect(byId.get("ls_absent")).toMatchObject({ present: false, marked: true });
    expect(byId.get("ls_other")).toMatchObject({ present: false, marked: false });
  });

  // The one that stops the summary card and the table under it disagreeing.
  it("agrees with getStudentAttendanceSummary on the same data", async () => {
    const enrolments = [
      { classroomId: "c_1", enrolledAt: FEB, classroom: { name: "Sunday Squad" } },
      { classroomId: "c_2", enrolledAt: JAN, classroom: { name: "Advanced" } },
    ];
    const records = [
      record("ls_jan", "c_1", JAN, "stu_1", true), // before enrolment in c_1
      record("ls_mar", "c_1", MAR, "stu_1", true),
      record("ls_feb", "c_2", FEB, "stu_1", false),
      record("ls_other", "c_2", MAR, "stu_2", true), // marked, but not for stu_1
    ];

    classroomStudentFindMany.mockResolvedValue(enrolments);
    findMany.mockResolvedValue(records);
    const detail = await getStudentAttendanceDetail("tenant_1", "stu_1", 100);

    classroomStudentFindMany.mockResolvedValue(enrolments);
    findMany.mockResolvedValue(records);
    const summary = await getStudentAttendanceSummary("tenant_1", "stu_1");

    expect(detail.length).toBe(summary.sessionCount);
    expect(detail.filter((r) => r.present).length).toBe(summary.attendedCount);
  });
});
