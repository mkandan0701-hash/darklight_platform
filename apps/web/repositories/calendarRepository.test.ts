import { beforeEach, describe, expect, it, vi } from "vitest";

const m = {
  liveSessionFindMany: vi.fn(),
  assignmentFindMany: vi.fn(),
  tournamentFindMany: vi.fn(),
  simulFindMany: vi.fn(),
  blockFindMany: vi.fn(),
  coachFindMany: vi.fn(),
  attendanceFindMany: vi.fn(),
  classroomFindFirst: vi.fn(),
  txLiveSessionUpdateMany: vi.fn(),
  txChangeCreateMany: vi.fn(),
};

const tx = {
  liveSession: { updateMany: (...a: unknown[]) => m.txLiveSessionUpdateMany(...a) },
  liveSessionChange: { createMany: (...a: unknown[]) => m.txChangeCreateMany(...a) },
};

vi.mock("@chessplay-clone/db", () => ({
  prisma: {
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    liveSession: { findMany: (...a: unknown[]) => m.liveSessionFindMany(...a) },
    assignment: { findMany: (...a: unknown[]) => m.assignmentFindMany(...a) },
    tournament: { findMany: (...a: unknown[]) => m.tournamentFindMany(...a) },
    simul: { findMany: (...a: unknown[]) => m.simulFindMany(...a) },
    calendarBlock: { findMany: (...a: unknown[]) => m.blockFindMany(...a) },
    coachProfile: { findMany: (...a: unknown[]) => m.coachFindMany(...a) },
    attendanceRecord: { findMany: (...a: unknown[]) => m.attendanceFindMany(...a) },
    classroom: { findFirst: (...a: unknown[]) => m.classroomFindFirst(...a) },
  },
}));

// visibleClassroomWhere is the real one: the calendar must compose the same
// membership rule every other classroom read uses, so stubbing it would
// assert nothing.
const { listCalendarEvents, findScheduleConflicts, rescheduleSessions, ConcurrentEditError } = await import(
  "./calendarRepository"
);
const { visibleClassroomWhere } = await import("./classroomRepository");

const range = { startUtc: new Date("2026-10-01T00:00:00Z"), endUtc: new Date("2026-11-01T00:00:00Z") };
const NOW = new Date("2026-10-18T00:00:00Z");

const person = (name: string) => ({ user: { displayName: name, email: `${name.toLowerCase()}@x.test` } });

function sessionRow(over: Record<string, unknown> = {}) {
  return {
    id: "ls_1",
    classroomId: "room_1",
    scheduledAtUtc: new Date("2026-10-24T04:30:00Z"),
    durationMins: 60,
    status: "SCHEDULED",
    startedAtUtc: null,
    meetingUrl: null,
    scheduleSlotId: null,
    seriesId: null,
    timezone: "Asia/Kolkata",
    updatedAt: new Date("2026-10-01T00:00:00Z"),
    scheduleSlot: null,
    classroom: {
      id: "room_1",
      name: "Saturday Juniors",
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      coaches: [{ coachId: "coach_A", coach: person("Priya") }],
      students: [
        { studentId: "stu_B", student: person("Arjun") },
        { studentId: "stu_C", student: person("Meera") },
      ],
    },
    _count: { attendance: 0, changes: 0 },
    ...over,
  };
}

const viewers = {
  admin: { tenantId: "t_1", id: "u_admin", role: "ACADEMY_ADMIN" as const, coachProfileId: null },
  coachA: { tenantId: "t_1", id: "u_coachA", role: "COACH" as const, coachProfileId: "coach_A" },
  coachZ: { tenantId: "t_1", id: "u_coachZ", role: "COACH" as const, coachProfileId: "coach_Z" },
  studentB: { tenantId: "t_1", id: "u_stuB", role: "STUDENT" as const, coachProfileId: null },
  parent: { tenantId: "t_1", id: "u_parent", role: "PARENT" as const, coachProfileId: null },
};

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.liveSessionFindMany.mockResolvedValue([]);
  m.assignmentFindMany.mockResolvedValue([]);
  m.tournamentFindMany.mockResolvedValue([]);
  m.simulFindMany.mockResolvedValue([]);
  m.blockFindMany.mockResolvedValue([]);
  m.coachFindMany.mockResolvedValue([]);
  m.attendanceFindMany.mockResolvedValue([]);
  m.txLiveSessionUpdateMany.mockResolvedValue({ count: 1 });
  m.txChangeCreateMany.mockResolvedValue({ count: 1 });
});

describe("listCalendarEvents — who sees which classes", () => {
  it("filters classes by tenant and the viewer's own classroom membership", async () => {
    await listCalendarEvents(viewers.studentB, { studentProfileId: "stu_B" }, range, NOW);
    const where = m.liveSessionFindMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe("t_1");
    expect(where.classroom.AND).toEqual([
      visibleClassroomWhere(viewers.studentB),
      { students: { some: { studentId: "stu_B" } } },
    ]);
  });

  it("intersects a parent's chosen child with the parent's own visibility, so a forged child id yields nothing extra", async () => {
    await listCalendarEvents(viewers.parent, { studentProfileId: "someone_elses_child" }, range, NOW);
    const and = m.liveSessionFindMany.mock.calls[0][0].where.classroom.AND;
    expect(and[0]).toEqual(visibleClassroomWhere(viewers.parent));
    expect(and[0].students.some.student.parents.some).toEqual({ parent: { userId: "u_parent" }, deletedAt: null });
  });

  it("narrows an admin's view to one coach", async () => {
    await listCalendarEvents(viewers.admin, { coachProfileId: "coach_A" }, range, NOW);
    expect(m.liveSessionFindMany.mock.calls[0][0].where.classroom.AND).toContainEqual({
      coaches: { some: { coachId: "coach_A" } },
    });
  });

  it("gives staff classmates' names and students only the head count", async () => {
    m.liveSessionFindMany.mockResolvedValue([sessionRow()]);
    const [asCoach] = await listCalendarEvents(viewers.coachA, {}, range, NOW);
    expect(asCoach.participants).toEqual({ count: 2, names: ["Arjun", "Meera"] });

    m.liveSessionFindMany.mockResolvedValue([sessionRow()]);
    const [asStudent] = await listCalendarEvents(viewers.studentB, { studentProfileId: "stu_B" }, range, NOW);
    expect(asStudent.participants).toEqual({ count: 2 });
    expect(JSON.stringify(asStudent)).not.toContain("meera@");
  });

  it("lets only an admin or an assigned coach edit", async () => {
    m.liveSessionFindMany.mockResolvedValue([sessionRow()]);
    expect((await listCalendarEvents(viewers.coachA, {}, range, NOW))[0].canEdit).toBe(true);
    m.liveSessionFindMany.mockResolvedValue([sessionRow()]);
    expect((await listCalendarEvents(viewers.coachZ, {}, range, NOW))[0].canEdit).toBe(false);
    m.liveSessionFindMany.mockResolvedValue([sessionRow()]);
    expect((await listCalendarEvents(viewers.admin, {}, range, NOW))[0].canEdit).toBe(true);
    m.liveSessionFindMany.mockResolvedValue([sessionRow()]);
    expect((await listCalendarEvents(viewers.studentB, { studentProfileId: "stu_B" }, range, NOW))[0].canEdit).toBe(false);
  });

  it("reports a cancellation and a reschedule from the one shared row", async () => {
    m.liveSessionFindMany.mockResolvedValue([
      sessionRow({ id: "ls_off", status: "CANCELLED" }),
      sessionRow({ id: "ls_moved", _count: { attendance: 0, changes: 1 } }),
    ]);
    const events = await listCalendarEvents(viewers.studentB, { studentProfileId: "stu_B" }, range, NOW);
    expect(events.find((e) => e.sourceId === "ls_off")?.status).toBe("CANCELLED");
    expect(events.find((e) => e.sourceId === "ls_moved")?.rescheduled).toBe(true);
  });

  it("shows a student their own attendance mark", async () => {
    m.liveSessionFindMany.mockResolvedValue([sessionRow({ scheduledAtUtc: new Date("2026-10-10T04:30:00Z") })]);
    m.attendanceFindMany.mockResolvedValue([{ liveSessionId: "ls_1", present: true }]);
    const [e] = await listCalendarEvents(viewers.studentB, { studentProfileId: "stu_B" }, range, NOW);
    expect(m.attendanceFindMany.mock.calls[0][0].where).toMatchObject({ tenantId: "t_1", studentId: "stu_B" });
    expect(e.attendance).toEqual({ marked: 0, present: true });
    expect(e.status).toBe("COMPLETED");
  });
});

describe("listCalendarEvents — tournaments, simuls, blocks", () => {
  it("shows a student only tournaments they're entered in", async () => {
    await listCalendarEvents(viewers.studentB, { studentProfileId: "stu_B" }, range, NOW);
    expect(m.tournamentFindMany.mock.calls[0][0].where.participants).toEqual({ some: { studentId: "stu_B" } });
  });

  it("returns no tournaments to a non-staff viewer without a student scope", async () => {
    await listCalendarEvents(viewers.parent, {}, range, NOW);
    expect(m.tournamentFindMany).not.toHaveBeenCalled();
  });

  it("holds a coach to their own simuls, even with a student filter", async () => {
    await listCalendarEvents(viewers.coachA, { studentProfileId: "stu_B" }, range, NOW);
    expect(m.simulFindMany.mock.calls[0][0].where.AND).toEqual([
      { coachId: "coach_A" },
      { boards: { some: { studentId: "stu_B" } } },
    ]);
  });

  it("never shows a student blocked time or staff-only entries", async () => {
    await listCalendarEvents(viewers.studentB, { studentProfileId: "stu_B" }, range, NOW);
    expect(m.blockFindMany.mock.calls[0][0].where.OR).toEqual([
      { kind: "HOLIDAY" },
      { kind: "OTHER", staffOnly: false },
    ]);
  });

  it("shows a coach only their own blocked time", async () => {
    await listCalendarEvents(viewers.coachA, {}, range, NOW);
    expect(m.blockFindMany.mock.calls[0][0].where.OR).toContainEqual({ kind: "UNAVAILABLE", coachId: "coach_A" });
    expect(m.blockFindMany.mock.calls[0][0].where.deletedAt).toBeNull();
  });
});

describe("findScheduleConflicts", () => {
  beforeEach(() => {
    m.classroomFindFirst.mockResolvedValue({
      coaches: [{ coachId: "coach_A", coach: person("Priya") }],
      students: [{ studentId: "stu_B", student: person("Arjun") }],
    });
  });

  it("finds coach, student and holiday clashes, ignoring cancelled classes and the class being moved", async () => {
    m.liveSessionFindMany.mockResolvedValue([
      {
        scheduledAtUtc: new Date("2026-10-24T04:00:00Z"),
        durationMins: 60,
        classroom: { name: "Endgames", coaches: [{ coachId: "coach_A" }], students: [{ studentId: "stu_B" }] },
      },
    ]);
    m.blockFindMany.mockResolvedValue([
      { kind: "HOLIDAY", title: "Diwali", startsAtUtc: new Date("2026-10-24T00:00:00Z"), endsAtUtc: new Date("2026-10-25T00:00:00Z"), coachId: null },
    ]);
    const conflicts = await findScheduleConflicts("t_1", {
      classroomId: "room_1",
      proposed: [{ startUtc: new Date("2026-10-24T04:30:00Z"), endUtc: new Date("2026-10-24T05:30:00Z") }],
      excludeSessionIds: ["ls_1"],
    });
    const where = m.liveSessionFindMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ not: "CANCELLED" });
    expect(where.id).toEqual({ notIn: ["ls_1"] });
    expect(conflicts.map((c) => c.reason).sort()).toEqual(["COACH", "HOLIDAY", "STUDENT"]);
  });

  it("refuses a classroom from another academy", async () => {
    m.classroomFindFirst.mockResolvedValue(null);
    await expect(
      findScheduleConflicts("t_1", { classroomId: "foreign", proposed: [{ startUtc: new Date(), endUtc: new Date() }] })
    ).rejects.toThrow("Classroom does not belong");
  });
});

describe("rescheduleSessions", () => {
  const move = {
    id: "ls_1",
    expectedVersion: new Date("2026-10-01T00:00:00Z"),
    fromStartUtc: new Date("2026-10-24T04:30:00Z"),
    fromDurationMins: 60,
    toStartUtc: new Date("2026-10-25T04:30:00Z"),
    toDurationMins: 60,
  };

  it("guards the write with the version the editor saw and records the change", async () => {
    await rescheduleSessions("t_1", [move], { actorUserId: "u_admin" });
    expect(m.txLiveSessionUpdateMany.mock.calls[0][0].where).toEqual({
      id: "ls_1",
      tenantId: "t_1",
      status: { not: "CANCELLED" },
      updatedAt: move.expectedVersion,
    });
    expect(m.txChangeCreateMany.mock.calls[0][0].data[0]).toMatchObject({
      kind: "RESCHEDULED",
      changedByUserId: "u_admin",
      previousStartUtc: move.fromStartUtc,
      newStartUtc: move.toStartUtc,
    });
  });

  it("refuses to overwrite someone else's concurrent change", async () => {
    m.txLiveSessionUpdateMany.mockResolvedValue({ count: 0 });
    await expect(rescheduleSessions("t_1", [move], { actorUserId: "u_admin" })).rejects.toBeInstanceOf(ConcurrentEditError);
    expect(m.txChangeCreateMany).not.toHaveBeenCalled();
  });
});
