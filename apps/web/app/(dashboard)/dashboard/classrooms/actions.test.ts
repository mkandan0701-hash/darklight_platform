import { beforeEach, describe, expect, it, vi } from "vitest";
import { TenantMismatchError } from "../../../../lib/auth/errors";

const getCurrentSession = vi.fn();
const getCoachProfileByUserId = vi.fn();
const isCoachAssignedToClassroom = vi.fn();
const getLiveSession = vi.fn();
const createLiveSession = vi.fn();
const cancelLiveSession = vi.fn();
const getLiveSessionWithAttendanceCount = vi.fn();
const markSessionStarted = vi.fn();
const setSessionMeetingUrl = vi.fn();
const setClassroomMeetingUrl = vi.fn();

vi.mock("../../../../lib/auth/session", () => ({
  getCurrentSession: () => getCurrentSession(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../../../repositories/userRepository", () => ({
  getCoachProfileByUserId: (...a: unknown[]) => getCoachProfileByUserId(...a),
}));
vi.mock("../../../../repositories/classroomRepository", () => ({
  createClassroom: vi.fn(),
  assignCoach: vi.fn(),
  enrollStudent: vi.fn(),
  isCoachAssignedToClassroom: (...a: unknown[]) => isCoachAssignedToClassroom(...a),
  setClassroomMeetingUrl: (...a: unknown[]) => setClassroomMeetingUrl(...a),
}));
vi.mock("../../../../repositories/liveSessionRepository", () => ({
  getLiveSession: (...a: unknown[]) => getLiveSession(...a),
  createLiveSession: (...a: unknown[]) => createLiveSession(...a),
  cancelLiveSession: (...a: unknown[]) => cancelLiveSession(...a),
  getLiveSessionWithAttendanceCount: (...a: unknown[]) =>
    getLiveSessionWithAttendanceCount(...a),
  markSessionStarted: (...a: unknown[]) => markSessionStarted(...a),
  setSessionMeetingUrl: (...a: unknown[]) => setSessionMeetingUrl(...a),
}));
const createScheduleSlot = vi.fn();
const getScheduleSlot = vi.fn();
const removeScheduleSlot = vi.fn();
const materializeSlot = vi.fn();
vi.mock("../../../../repositories/scheduleSlotRepository", () => ({
  createScheduleSlot: (...a: unknown[]) => createScheduleSlot(...a),
  getScheduleSlot: (...a: unknown[]) => getScheduleSlot(...a),
  removeScheduleSlot: (...a: unknown[]) => removeScheduleSlot(...a),
  materializeSlot: (...a: unknown[]) => materializeSlot(...a),
}));

const {
  scheduleSessionAction,
  cancelSessionAction,
  addScheduleSlotAction,
  removeScheduleSlotAction,
  startSessionAction,
  setMeetingUrlAction,
} = await import("./actions");

const sessionAs = (role: string) => ({
  id: "user_1",
  tenantId: "tenant_1",
  role,
  email: "c@x.test",
  timezone: "UTC",
});

function scheduleForm(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("classroomId", "c_1");
  fd.set("localDateTime", "2026-09-05T10:00");
  fd.set("durationMins", "60");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

function cancelForm(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("classroomId", "c_1");
  fd.set("liveSessionId", "ls_1");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

function scheduleSlotForm(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("classroomId", "c_1");
  fd.set("dayOfWeek", "6");
  fd.set("localTime", "10:00");
  fd.set("timezone", "Asia/Kolkata");
  fd.set("durationMins", "60");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

function removeSlotForm(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("classroomId", "c_1");
  fd.set("scheduleSlotId", "slot_1");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  [
    getCurrentSession,
    getCoachProfileByUserId,
    isCoachAssignedToClassroom,
    getLiveSession,
    createLiveSession,
    cancelLiveSession,
    createScheduleSlot,
    getScheduleSlot,
    removeScheduleSlot,
    materializeSlot,
    getLiveSessionWithAttendanceCount,
    markSessionStarted,
    setSessionMeetingUrl,
    setClassroomMeetingUrl,
  ].forEach((m) => m.mockReset());

  getCurrentSession.mockResolvedValue(sessionAs("COACH"));
  getCoachProfileByUserId.mockResolvedValue({ id: "coach_1" });
  isCoachAssignedToClassroom.mockResolvedValue(true);
  getLiveSession.mockResolvedValue({ id: "ls_1", classroomId: "c_1" });
  createLiveSession.mockResolvedValue({ id: "ls_1" });
  cancelLiveSession.mockResolvedValue(true);
  createScheduleSlot.mockResolvedValue({ id: "slot_1", classroomId: "c_1" });
  getScheduleSlot.mockResolvedValue({ id: "slot_1", classroomId: "c_1" });
  removeScheduleSlot.mockResolvedValue(true);
  materializeSlot.mockResolvedValue({ count: 8 });
});

// The gap this file was written for: scheduleSessionAction checked the role
// and stopped there, so any coach in the academy could schedule a class into
// any classroom — including one they don't teach — by supplying its id. The
// read-side equivalents were fixed in b87c3cf/e9f6e4c; this is the write side.
describe("scheduleSessionAction", () => {
  it("refuses a coach who isn't assigned to the classroom", async () => {
    isCoachAssignedToClassroom.mockResolvedValue(false);
    const result = await scheduleSessionAction(scheduleForm());
    expect(result).toEqual({ ok: false, error: "You aren't assigned to this classroom" });
    expect(createLiveSession).not.toHaveBeenCalled();
  });

  it("refuses a coach with no coach profile at all", async () => {
    getCoachProfileByUserId.mockResolvedValue(null);
    const result = await scheduleSessionAction(scheduleForm());
    expect(result).toEqual({ ok: false, error: "You aren't assigned to this classroom" });
    expect(createLiveSession).not.toHaveBeenCalled();
  });

  it("allows an assigned coach", async () => {
    expect(await scheduleSessionAction(scheduleForm())).toEqual({ ok: true });
    expect(createLiveSession).toHaveBeenCalled();
  });

  // An admin runs the academy, so the per-classroom check doesn't apply — but
  // it must be skipped explicitly, not by accident of a null coach profile.
  it("allows an admin without consulting classroom assignment", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("ACADEMY_ADMIN"));
    expect(await scheduleSessionAction(scheduleForm())).toEqual({ ok: true });
    expect(isCoachAssignedToClassroom).not.toHaveBeenCalled();
  });

  it("refuses a student outright", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("STUDENT"));
    const result = await scheduleSessionAction(scheduleForm());
    expect(result).toMatchObject({ ok: false });
    expect(createLiveSession).not.toHaveBeenCalled();
  });
});

describe("cancelSessionAction", () => {
  it("refuses a coach who isn't assigned to the classroom", async () => {
    isCoachAssignedToClassroom.mockResolvedValue(false);
    const result = await cancelSessionAction(cancelForm());
    expect(result).toEqual({ ok: false, error: "You aren't assigned to this classroom" });
    expect(cancelLiveSession).not.toHaveBeenCalled();
  });

  it("refuses a student outright", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("STUDENT"));
    expect(await cancelSessionAction(cancelForm())).toMatchObject({ ok: false });
    expect(cancelLiveSession).not.toHaveBeenCalled();
  });

  // Rights to this classroom must not extend to a session id from another one.
  it("refuses a session belonging to a different classroom", async () => {
    getLiveSession.mockResolvedValue({ id: "ls_1", classroomId: "someone_elses" });
    const result = await cancelSessionAction(cancelForm());
    expect(result).toEqual({ ok: false, error: "Session not found in this classroom" });
    expect(cancelLiveSession).not.toHaveBeenCalled();
  });

  it("reports a session that no longer exists rather than claiming success", async () => {
    cancelLiveSession.mockResolvedValue(false);
    expect(await cancelSessionAction(cancelForm())).toEqual({
      ok: false,
      error: "Session not found",
    });
  });

  it("cancels for an assigned coach", async () => {
    expect(await cancelSessionAction(cancelForm())).toEqual({ ok: true });
    expect(cancelLiveSession).toHaveBeenCalledWith("tenant_1", "ls_1");
  });
});

describe("addScheduleSlotAction", () => {
  it("refuses a coach who isn't assigned to the classroom", async () => {
    isCoachAssignedToClassroom.mockResolvedValue(false);
    const result = await addScheduleSlotAction(scheduleSlotForm());
    expect(result).toEqual({ ok: false, error: "You aren't assigned to this classroom" });
    expect(createScheduleSlot).not.toHaveBeenCalled();
  });

  it("refuses a student outright", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("STUDENT"));
    const result = await addScheduleSlotAction(scheduleSlotForm());
    expect(result).toMatchObject({ ok: false });
    expect(createScheduleSlot).not.toHaveBeenCalled();
  });

  it("creates the slot and immediately materializes upcoming sessions for an assigned coach", async () => {
    expect(await addScheduleSlotAction(scheduleSlotForm())).toEqual({ ok: true });
    expect(createScheduleSlot).toHaveBeenCalledWith("tenant_1", "c_1", {
      dayOfWeek: 6,
      localTime: "10:00",
      timezone: "Asia/Kolkata",
      durationMins: 60,
    });
    expect(materializeSlot).toHaveBeenCalledWith("tenant_1", { id: "slot_1", classroomId: "c_1" });
  });

  it("does not materialize when the classroom doesn't belong to this academy", async () => {
    createScheduleSlot.mockRejectedValue(new TenantMismatchError("nope"));
    const result = await addScheduleSlotAction(scheduleSlotForm());
    expect(result).toEqual({ ok: false, error: "That classroom isn't part of your academy" });
    expect(materializeSlot).not.toHaveBeenCalled();
  });
});

describe("removeScheduleSlotAction", () => {
  it("refuses a coach who isn't assigned to the classroom", async () => {
    isCoachAssignedToClassroom.mockResolvedValue(false);
    const result = await removeScheduleSlotAction(removeSlotForm());
    expect(result).toEqual({ ok: false, error: "You aren't assigned to this classroom" });
    expect(removeScheduleSlot).not.toHaveBeenCalled();
  });

  // Same nested-route consistency cancelSessionAction enforces for sessions.
  it("refuses a slot belonging to a different classroom", async () => {
    getScheduleSlot.mockResolvedValue({ id: "slot_1", classroomId: "someone_elses" });
    const result = await removeScheduleSlotAction(removeSlotForm());
    expect(result).toEqual({ ok: false, error: "Schedule slot not found in this classroom" });
    expect(removeScheduleSlot).not.toHaveBeenCalled();
  });

  it("reports a slot that no longer exists rather than claiming success", async () => {
    removeScheduleSlot.mockResolvedValue(false);
    expect(await removeScheduleSlotAction(removeSlotForm())).toEqual({
      ok: false,
      error: "Schedule slot not found",
    });
  });

  it("removes for an assigned coach", async () => {
    expect(await removeScheduleSlotAction(removeSlotForm())).toEqual({ ok: true });
    expect(removeScheduleSlot).toHaveBeenCalledWith("tenant_1", "slot_1");
  });
});

describe("startSessionAction", () => {
  const startForm = () => {
    const fd = new FormData();
    fd.set("classroomId", "c_1");
    fd.set("liveSessionId", "ls_1");
    return fd;
  };
  const sessionStartingIn = (mins: number, extra: Record<string, unknown> = {}) => ({
    id: "ls_1",
    classroomId: "c_1",
    scheduledAtUtc: new Date(Date.now() + mins * 60_000),
    durationMins: 60,
    status: "SCHEDULED",
    startedAtUtc: null,
    _count: { attendance: 0 },
    ...extra,
  });

  beforeEach(() => {
    getLiveSessionWithAttendanceCount.mockResolvedValue(sessionStartingIn(5));
  });

  it("stamps the start and returns the session page for an assigned coach", async () => {
    expect(await startSessionAction(startForm())).toEqual({
      ok: true,
      href: "/dashboard/classrooms/c_1/sessions/ls_1",
    });
    expect(markSessionStarted).toHaveBeenCalledWith("tenant_1", "ls_1");
  });

  it.each(["ACADEMY_ADMIN", "STUDENT", "PARENT"])("refuses %s", async (role) => {
    getCurrentSession.mockResolvedValue(sessionAs(role));
    expect((await startSessionAction(startForm())).ok).toBe(false);
    expect(markSessionStarted).not.toHaveBeenCalled();
  });

  it("refuses a coach who isn't assigned to the classroom", async () => {
    isCoachAssignedToClassroom.mockResolvedValue(false);
    expect((await startSessionAction(startForm())).ok).toBe(false);
    expect(markSessionStarted).not.toHaveBeenCalled();
  });

  it("refuses a session from another classroom", async () => {
    getLiveSessionWithAttendanceCount.mockResolvedValue(
      sessionStartingIn(5, { classroomId: "c_other" })
    );
    expect((await startSessionAction(startForm())).ok).toBe(false);
    expect(markSessionStarted).not.toHaveBeenCalled();
  });

  it("refuses a class more than 15 minutes away", async () => {
    getLiveSessionWithAttendanceCount.mockResolvedValue(sessionStartingIn(60));
    expect((await startSessionAction(startForm())).ok).toBe(false);
    expect(markSessionStarted).not.toHaveBeenCalled();
  });

  it("allows starting a delayed class late", async () => {
    getLiveSessionWithAttendanceCount.mockResolvedValue(sessionStartingIn(-24 * 60));
    expect((await startSessionAction(startForm())).ok).toBe(true);
  });

  it("refuses a cancelled class", async () => {
    getLiveSessionWithAttendanceCount.mockResolvedValue(
      sessionStartingIn(5, { status: "CANCELLED" })
    );
    expect((await startSessionAction(startForm())).ok).toBe(false);
  });
});

describe("setMeetingUrlAction", () => {
  const linkForm = (overrides: Record<string, string> = {}) => {
    const fd = new FormData();
    fd.set("classroomId", "c_1");
    fd.set("meetingUrl", "https://meet.google.com/abc-defg-hij");
    for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
    return fd;
  };

  beforeEach(() => {
    setClassroomMeetingUrl.mockResolvedValue(true);
    setSessionMeetingUrl.mockResolvedValue(true);
  });

  it("sets the classroom's standing link", async () => {
    expect(await setMeetingUrlAction(linkForm())).toEqual({ ok: true });
    expect(setClassroomMeetingUrl).toHaveBeenCalledWith(
      "tenant_1",
      "c_1",
      "https://meet.google.com/abc-defg-hij"
    );
  });

  it("clears the link when the field is empty", async () => {
    await setMeetingUrlAction(linkForm({ meetingUrl: "" }));
    expect(setClassroomMeetingUrl).toHaveBeenCalledWith("tenant_1", "c_1", null);
  });

  it.each(["javascript:alert(1)", "http://meet.google.com/abc"])(
    "rejects %s before writing anything",
    async (meetingUrl) => {
      expect((await setMeetingUrlAction(linkForm({ meetingUrl }))).ok).toBe(false);
      expect(setClassroomMeetingUrl).not.toHaveBeenCalled();
    }
  );

  it("refuses a student", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("STUDENT"));
    expect((await setMeetingUrlAction(linkForm())).ok).toBe(false);
    expect(setClassroomMeetingUrl).not.toHaveBeenCalled();
  });

  it("refuses a coach who isn't assigned to the classroom", async () => {
    isCoachAssignedToClassroom.mockResolvedValue(false);
    expect((await setMeetingUrlAction(linkForm())).ok).toBe(false);
    expect(setClassroomMeetingUrl).not.toHaveBeenCalled();
  });

  it("sets a per-session override only on a session in that classroom", async () => {
    expect(await setMeetingUrlAction(linkForm({ liveSessionId: "ls_1" }))).toEqual({ ok: true });
    expect(setSessionMeetingUrl).toHaveBeenCalled();

    setSessionMeetingUrl.mockClear();
    getLiveSession.mockResolvedValue({ id: "ls_9", classroomId: "c_other" });
    expect((await setMeetingUrlAction(linkForm({ liveSessionId: "ls_9" }))).ok).toBe(false);
    expect(setSessionMeetingUrl).not.toHaveBeenCalled();
  });
});
