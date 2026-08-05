import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentSession = vi.fn();
const getCoachProfileByUserId = vi.fn();
const isCoachAssignedToClassroom = vi.fn();
const getLiveSession = vi.fn();
const createLiveSession = vi.fn();
const cancelLiveSession = vi.fn();

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
}));
vi.mock("../../../../repositories/liveSessionRepository", () => ({
  getLiveSession: (...a: unknown[]) => getLiveSession(...a),
  createLiveSession: (...a: unknown[]) => createLiveSession(...a),
  cancelLiveSession: (...a: unknown[]) => cancelLiveSession(...a),
}));

const { scheduleSessionAction, cancelSessionAction } = await import("./actions");

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

beforeEach(() => {
  [
    getCurrentSession,
    getCoachProfileByUserId,
    isCoachAssignedToClassroom,
    getLiveSession,
    createLiveSession,
    cancelLiveSession,
  ].forEach((m) => m.mockReset());

  getCurrentSession.mockResolvedValue(sessionAs("COACH"));
  getCoachProfileByUserId.mockResolvedValue({ id: "coach_1" });
  isCoachAssignedToClassroom.mockResolvedValue(true);
  getLiveSession.mockResolvedValue({ id: "ls_1", classroomId: "c_1" });
  createLiveSession.mockResolvedValue({ id: "ls_1" });
  cancelLiveSession.mockResolvedValue(true);
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
