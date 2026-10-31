import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentSession = vi.fn();
const getCoachProfileByUserId = vi.fn();
const isCoachAssignedToClassroom = vi.fn();
const repo = {
  findScheduleConflicts: vi.fn(),
  createCalendarSessions: vi.fn(),
  getSessionForCalendarEdit: vi.fn(),
  listSeriesSessionsFrom: vi.fn(),
  rescheduleSessions: vi.fn(),
  splitSlotSeries: vi.fn(),
  cancelSessions: vi.fn(),
  createCalendarBlock: vi.fn(),
  getCalendarBlock: vi.fn(),
  updateCalendarBlock: vi.fn(),
  deleteCalendarBlock: vi.fn(),
};
const createScheduleSlot = vi.fn();
const materializeSlot = vi.fn();

vi.mock("../../../../lib/auth/session", () => ({ getCurrentSession: () => getCurrentSession() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../../../repositories/userRepository", () => ({
  getCoachProfileByUserId: (...a: unknown[]) => getCoachProfileByUserId(...a),
}));
vi.mock("../../../../repositories/classroomRepository", () => ({
  isCoachAssignedToClassroom: (...a: unknown[]) => isCoachAssignedToClassroom(...a),
}));
vi.mock("../../../../repositories/scheduleSlotRepository", () => ({
  createScheduleSlot: (...a: unknown[]) => createScheduleSlot(...a),
  materializeSlot: (...a: unknown[]) => materializeSlot(...a),
}));
vi.mock("../../../../repositories/calendarRepository", async () => {
  const actual = await vi.importActual<typeof import("../../../../repositories/calendarRepository")>(
    "../../../../repositories/calendarRepository"
  );
  return {
    ConcurrentEditError: actual.ConcurrentEditError,
    ...Object.fromEntries(Object.entries(repo).map(([k, fn]) => [k, (...a: unknown[]) => fn(...a)])),
  };
});

const {
  createCalendarClassAction,
  rescheduleClassAction,
  cancelClassAction,
  saveCalendarBlockAction,
  deleteCalendarBlockAction,
} = await import("./actions");
const { ConcurrentEditError } = await import("../../../../repositories/calendarRepository");

const sessionAs = (role: string, id = "u_1") => ({ id, tenantId: "t_1", role, email: "x@x.test", timezone: "Asia/Kolkata" });

const future = "2099-10-24T18:00";
const classInput = (over: Record<string, unknown> = {}) => ({
  classroomId: "room_1",
  startLocal: future,
  timezone: "Asia/Kolkata",
  durationMins: 60,
  recurrence: { freq: "NONE" },
  ...over,
});

const conflict = {
  reason: "COACH",
  message: 'Priya is already teaching "Endgames"',
  occurrenceStartUtc: "2099-10-24T12:30:00.000Z",
  otherStartUtc: "2099-10-24T12:00:00.000Z",
  otherEndUtc: "2099-10-24T13:00:00.000Z",
};

const liveRow = (over: Record<string, unknown> = {}) => ({
  id: "ls_1",
  classroomId: "room_1",
  scheduledAtUtc: new Date("2099-10-24T12:30:00Z"),
  durationMins: 60,
  status: "SCHEDULED",
  startedAtUtc: null,
  scheduleSlotId: null,
  scheduleSlot: null,
  seriesId: null,
  timezone: "Asia/Kolkata",
  classroom: { coaches: [{ coachId: "coach_A" }] },
  _count: { attendance: 0 },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  getCoachProfileByUserId.mockResolvedValue({ id: "coach_A" });
  isCoachAssignedToClassroom.mockResolvedValue(true);
  repo.findScheduleConflicts.mockResolvedValue([]);
  repo.createCalendarSessions.mockResolvedValue({ count: 1, seriesId: null });
  repo.getSessionForCalendarEdit.mockResolvedValue(liveRow());
  repo.listSeriesSessionsFrom.mockResolvedValue([]);
  repo.cancelSessions.mockResolvedValue(1);
});

describe("createCalendarClassAction", () => {
  it("lets an admin create a class for any classroom", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("ACADEMY_ADMIN"));
    const result = await createCalendarClassAction(classInput());
    expect(result).toEqual({ ok: true, message: "Class scheduled" });
    const [, input, audit] = repo.createCalendarSessions.mock.calls[0];
    expect(input).toMatchObject({ classroomId: "room_1", timezone: "Asia/Kolkata", durationMins: 60 });
    // 6 PM IST stored as UTC.
    expect(input.occurrences[0].startUtc.toISOString()).toBe("2099-10-24T12:30:00.000Z");
    expect(audit).toMatchObject({ actorUserId: "u_1", conflictOverride: false });
  });

  it("refuses students and parents outright", async () => {
    for (const role of ["STUDENT", "PARENT"]) {
      getCurrentSession.mockResolvedValue(sessionAs(role));
      const result = await createCalendarClassAction(classInput());
      expect(result.ok).toBe(false);
    }
    expect(repo.createCalendarSessions).not.toHaveBeenCalled();
  });

  it("refuses a coach scheduling into a classroom they don't teach", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("COACH"));
    isCoachAssignedToClassroom.mockResolvedValue(false);
    const result = await createCalendarClassAction(classInput());
    expect(result).toEqual({ ok: false, error: "You aren't assigned to this classroom" });
    expect(repo.createCalendarSessions).not.toHaveBeenCalled();
  });

  it("rejects invalid input before touching the database", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("ACADEMY_ADMIN"));
    expect((await createCalendarClassAction(classInput({ durationMins: 0 }))).ok).toBe(false);
    expect((await createCalendarClassAction(classInput({ timezone: "Mars/Olympus" }))).ok).toBe(false);
    expect((await createCalendarClassAction(classInput({ startLocal: "2099-02-30T10:00" }))).ok).toBe(false);
    expect((await createCalendarClassAction(classInput({ meetingUrl: "javascript:alert(1)" }))).ok).toBe(false);
    expect(repo.createCalendarSessions).not.toHaveBeenCalled();
  });

  it("returns clashes instead of saving, and lets only an admin override them", async () => {
    repo.findScheduleConflicts.mockResolvedValue([conflict]);

    getCurrentSession.mockResolvedValue(sessionAs("COACH"));
    const coachTry = await createCalendarClassAction(classInput({ override: true }));
    expect(coachTry).toMatchObject({ ok: false, conflicts: [conflict], canOverride: false });

    getCurrentSession.mockResolvedValue(sessionAs("ACADEMY_ADMIN"));
    const adminFirst = await createCalendarClassAction(classInput());
    expect(adminFirst).toMatchObject({ ok: false, canOverride: true });
    expect(repo.createCalendarSessions).not.toHaveBeenCalled();

    const adminOverride = await createCalendarClassAction(classInput({ override: true }));
    expect(adminOverride.ok).toBe(true);
    expect(repo.createCalendarSessions.mock.calls[0][2]).toMatchObject({
      conflictOverride: true,
      conflictSummary: 'Priya is already teaching "Endgames"',
    });
  });

  it("creates every occurrence of a finite weekly series in one call", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("ACADEMY_ADMIN"));
    repo.createCalendarSessions.mockResolvedValue({ count: 4, seriesId: "s" });
    const result = await createCalendarClassAction(
      classInput({ recurrence: { freq: "WEEKLY", interval: 1, weekdays: [6], end: { kind: "COUNT", count: 4 } } })
    );
    expect(result).toEqual({ ok: true, message: "4 classes scheduled" });
    expect(repo.createCalendarSessions.mock.calls[0][1].occurrences).toHaveLength(4);
  });

  it("turns an ongoing weekly repeat into schedule templates that start on the chosen date", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("ACADEMY_ADMIN"));
    createScheduleSlot.mockResolvedValue({ id: "slot_1" });
    materializeSlot.mockResolvedValue({ count: 8 });
    const result = await createCalendarClassAction(classInput({ recurrence: { freq: "WEEKLY_ONGOING", weekdays: [6] } }));
    expect(result.ok).toBe(true);
    expect(createScheduleSlot.mock.calls[0][2]).toEqual({
      dayOfWeek: 6,
      localTime: "18:00",
      timezone: "Asia/Kolkata",
      durationMins: 60,
      startsOn: "2099-10-24",
    });
  });
});

describe("rescheduleClassAction", () => {
  const input = (over: Record<string, unknown> = {}) => ({
    sessionId: "ls_1",
    version: "2099-01-01T00:00:00.000Z",
    startLocal: "2099-10-25T18:00",
    timezone: "Asia/Kolkata",
    durationMins: 60,
    ...over,
  });

  it("refuses a coach who isn't on the class", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("COACH"));
    getCoachProfileByUserId.mockResolvedValue({ id: "coach_Z" });
    expect(await rescheduleClassAction(input())).toEqual({ ok: false, error: "You aren't assigned to this classroom" });
    expect(repo.rescheduleSessions).not.toHaveBeenCalled();
  });

  it("refuses to move a class that was already held or cancelled", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("ACADEMY_ADMIN"));
    repo.getSessionForCalendarEdit.mockResolvedValue(liveRow({ _count: { attendance: 3 } }));
    expect((await rescheduleClassAction(input())).ok).toBe(false);
    repo.getSessionForCalendarEdit.mockResolvedValue(liveRow({ status: "CANCELLED" }));
    expect((await rescheduleClassAction(input())).ok).toBe(false);
    expect(repo.rescheduleSessions).not.toHaveBeenCalled();
  });

  it("moves only this occurrence by default, keeping the version check", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("COACH"));
    const result = await rescheduleClassAction(input());
    expect(result).toEqual({ ok: true, message: "Class rescheduled" });
    const [, moves] = repo.rescheduleSessions.mock.calls[0];
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ id: "ls_1", expectedVersion: new Date("2099-01-01T00:00:00.000Z") });
    expect(moves[0].toStartUtc.toISOString()).toBe("2099-10-25T12:30:00.000Z");
    expect(repo.listSeriesSessionsFrom).not.toHaveBeenCalled();
  });

  it("moves the following occurrences of a finite series with it", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("ACADEMY_ADMIN"));
    repo.getSessionForCalendarEdit.mockResolvedValue(liveRow({ seriesId: "series_1" }));
    repo.listSeriesSessionsFrom.mockResolvedValue([
      liveRow({ seriesId: "series_1" }),
      liveRow({ id: "ls_2", seriesId: "series_1", scheduledAtUtc: new Date("2099-10-31T12:30:00Z") }),
    ]);
    const result = await rescheduleClassAction(input({ scope: "FOLLOWING" }));
    expect(result).toEqual({ ok: true, message: "2 classes rescheduled" });
    const moves = repo.rescheduleSessions.mock.calls[0][1];
    expect(moves.map((mv: { toStartUtc: Date }) => mv.toStartUtc.toISOString())).toEqual([
      "2099-10-25T12:30:00.000Z",
      "2099-11-01T12:30:00.000Z",
    ]);
  });

  it("reports a concurrent edit instead of claiming success", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("ACADEMY_ADMIN"));
    repo.rescheduleSessions.mockRejectedValue(new ConcurrentEditError("This class was changed or cancelled by someone else"));
    const result = await rescheduleClassAction(input());
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("Refresh the calendar");
  });
});

describe("cancelClassAction", () => {
  it("cancels one class for everyone with an audit row", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("COACH"));
    expect(await cancelClassAction({ sessionId: "ls_1" })).toEqual({ ok: true, message: "Class cancelled" });
    const [, targets, audit, opts] = repo.cancelSessions.mock.calls[0];
    expect(targets.map((t: { id: string }) => t.id)).toEqual(["ls_1"]);
    expect(audit).toEqual({ actorUserId: "u_1" });
    expect(opts).toEqual({ retireSlotId: undefined });
  });

  it("retires the weekly template when cancelling all upcoming classes in it", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("ACADEMY_ADMIN"));
    repo.getSessionForCalendarEdit.mockResolvedValue(liveRow({ scheduleSlotId: "slot_1" }));
    repo.listSeriesSessionsFrom.mockResolvedValue([liveRow({ scheduleSlotId: "slot_1" }), liveRow({ id: "ls_2" })]);
    repo.cancelSessions.mockResolvedValue(2);
    await cancelClassAction({ sessionId: "ls_1", scope: "ALL" });
    expect(repo.cancelSessions.mock.calls[0][3]).toEqual({ retireSlotId: "slot_1" });
  });

  it("refuses students", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("STUDENT"));
    expect((await cancelClassAction({ sessionId: "ls_1" })).ok).toBe(false);
    expect(repo.cancelSessions).not.toHaveBeenCalled();
  });
});

describe("calendar blocks", () => {
  const block = (over: Record<string, unknown> = {}) => ({
    kind: "HOLIDAY",
    title: "Diwali break",
    allDay: true,
    startLocal: "2099-11-08T00:00",
    endLocal: "2099-11-09T00:00",
    timezone: "Asia/Kolkata",
    ...over,
  });

  it("stores an all-day holiday as local midnights, end date inclusive", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("ACADEMY_ADMIN"));
    expect((await saveCalendarBlockAction(block())).ok).toBe(true);
    const data = repo.createCalendarBlock.mock.calls[0][1];
    expect(data.startsAtUtc.toISOString()).toBe("2099-11-07T18:30:00.000Z");
    expect(data.endsAtUtc.toISOString()).toBe("2099-11-09T18:30:00.000Z");
  });

  it("rejects an entry that ends before it starts", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("ACADEMY_ADMIN"));
    const result = await saveCalendarBlockAction(
      block({ allDay: false, startLocal: "2099-11-08T12:00", endLocal: "2099-11-08T11:00" })
    );
    expect(result).toEqual({ ok: false, error: "The end must be after the start" });
  });

  it("keeps holidays admin-only", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("COACH"));
    expect((await saveCalendarBlockAction(block())).ok).toBe(false);
    expect(repo.createCalendarBlock).not.toHaveBeenCalled();
  });

  it("files a coach's blocked time under their own profile, whatever the form says", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("COACH"));
    await saveCalendarBlockAction(block({ kind: "UNAVAILABLE", coachProfileId: "coach_SOMEONE_ELSE" }));
    expect(repo.createCalendarBlock.mock.calls[0][1]).toMatchObject({ coachId: "coach_A", staffOnly: true });
  });

  it("won't let a coach delete someone else's entry", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("COACH"));
    repo.getCalendarBlock.mockResolvedValue({ id: "b_1", kind: "UNAVAILABLE", coachId: "coach_Z" });
    expect((await deleteCalendarBlockAction({ id: "b_1" })).ok).toBe(false);
    repo.getCalendarBlock.mockResolvedValue({ id: "b_2", kind: "HOLIDAY", coachId: null });
    expect((await deleteCalendarBlockAction({ id: "b_2" })).ok).toBe(false);
    expect(repo.deleteCalendarBlock).not.toHaveBeenCalled();
  });
});
