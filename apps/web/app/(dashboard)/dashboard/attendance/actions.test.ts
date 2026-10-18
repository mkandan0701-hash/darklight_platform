import { beforeEach, describe, expect, it, vi } from "vitest";

// The first server-action test in the repo. Every actions.ts is where
// authorization actually lives, and none of them were covered — a coach being
// able to mark another coach's roster would have shipped silently.

const getCurrentSession = vi.fn();
const getCoachProfileByUserId = vi.fn();
const getClassroom = vi.fn();
const isCoachAssignedToClassroom = vi.fn();
const getLiveSession = vi.fn();
const markAttendance = vi.fn();
const awardXpSafely = vi.fn();

vi.mock("../../../../lib/auth/session", () => ({
  getCurrentSession: () => getCurrentSession(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../../../repositories/userRepository", () => ({
  getCoachProfileByUserId: (...a: unknown[]) => getCoachProfileByUserId(...a),
}));
vi.mock("../../../../repositories/classroomRepository", () => ({
  getClassroom: (...a: unknown[]) => getClassroom(...a),
  isCoachAssignedToClassroom: (...a: unknown[]) => isCoachAssignedToClassroom(...a),
}));
vi.mock("../../../../repositories/liveSessionRepository", () => ({
  getLiveSession: (...a: unknown[]) => getLiveSession(...a),
}));
vi.mock("../../../../repositories/attendanceRepository", () => ({
  markAttendance: (...a: unknown[]) => markAttendance(...a),
}));
// Unmocked, this reached a real Prisma client: awardXpSafely swallows the
// resulting error, so the test still passed — but it spent seconds per case
// waiting on a network round trip, and tipped over the default timeout under
// a full-suite run. Mocking it also lets the XP rules be asserted directly.
vi.mock("../../../../repositories/gamificationRepository", () => ({
  awardXpSafely: (...a: unknown[]) => awardXpSafely(...a),
}));

const { markAttendanceAction } = await import("./actions");

function sessionAs(role: string) {
  return { id: "user_1", tenantId: "tenant_1", role, email: "c@x.test", timezone: "UTC" };
}

function formDataFor(studentIds: string[], overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("classroomId", "c_1");
  fd.set("liveSessionId", "ls_1");
  for (const id of studentIds) {
    fd.append("studentIds", id);
    fd.set(`present:${id}`, "on");
    fd.set(`mode:${id}`, "ONLINE");
  }
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

const classroomWith = (studentIds: string[]) => ({
  id: "c_1",
  students: studentIds.map((studentId) => ({ studentId })),
});

beforeEach(() => {
  [
    getCurrentSession,
    getCoachProfileByUserId,
    getClassroom,
    isCoachAssignedToClassroom,
    getLiveSession,
    markAttendance,
    awardXpSafely,
  ].forEach((m) => m.mockReset());

  getCurrentSession.mockResolvedValue(sessionAs("COACH"));
  getClassroom.mockResolvedValue(classroomWith(["stu_1"]));
  getCoachProfileByUserId.mockResolvedValue({ id: "coach_1" });
  isCoachAssignedToClassroom.mockResolvedValue(true);
  getLiveSession.mockResolvedValue({ id: "ls_1", classroomId: "c_1" });
});

describe("markAttendanceAction authorization", () => {
  it("refuses a student outright", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("STUDENT"));
    const result = await markAttendanceAction(formDataFor(["stu_1"]));
    expect(result).toEqual({
      ok: false,
      error: "Only coaches and academy admins can mark attendance",
    });
    expect(markAttendance).not.toHaveBeenCalled();
  });

  it("refuses a parent outright", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("PARENT"));
    const result = await markAttendanceAction(formDataFor(["stu_1"]));
    expect(result.ok).toBe(false);
    expect(markAttendance).not.toHaveBeenCalled();
  });

  // The check that matters: having the COACH role is not the same as teaching
  // *this* classroom.
  it("refuses a coach who isn't assigned to the classroom", async () => {
    isCoachAssignedToClassroom.mockResolvedValue(false);
    const result = await markAttendanceAction(formDataFor(["stu_1"]));
    expect(result).toEqual({ ok: false, error: "You aren't assigned to this classroom" });
    expect(markAttendance).not.toHaveBeenCalled();
  });

  it("refuses a coach with no coach profile at all", async () => {
    getCoachProfileByUserId.mockResolvedValue(null);
    const result = await markAttendanceAction(formDataFor(["stu_1"]));
    expect(result.ok).toBe(false);
    expect(markAttendance).not.toHaveBeenCalled();
  });

  it("allows an assigned coach", async () => {
    const result = await markAttendanceAction(formDataFor(["stu_1"]));
    expect(result).toEqual({ ok: true });
    expect(markAttendance).toHaveBeenCalledWith("tenant_1", "ls_1", [
      { studentId: "stu_1", present: true, mode: "ONLINE" },
    ]);
  });

  // An admin oversees the whole academy, so no per-classroom membership.
  it("allows an admin without checking classroom assignment", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("ACADEMY_ADMIN"));
    const result = await markAttendanceAction(formDataFor(["stu_1"]));
    expect(result).toEqual({ ok: true });
    expect(isCoachAssignedToClassroom).not.toHaveBeenCalled();
  });
});

describe("markAttendanceAction integrity", () => {
  it("refuses a session belonging to a different classroom", async () => {
    getLiveSession.mockResolvedValue({ id: "ls_1", classroomId: "someone_elses" });
    const result = await markAttendanceAction(formDataFor(["stu_1"]));
    expect(result).toEqual({ ok: false, error: "Session not found in this classroom" });
    expect(markAttendance).not.toHaveBeenCalled();
  });

  it("refuses an unknown classroom", async () => {
    getClassroom.mockResolvedValue(null);
    const result = await markAttendanceAction(formDataFor(["stu_1"]));
    expect(result).toEqual({ ok: false, error: "Classroom not found" });
  });

  // A forged studentId in the form must not create a record for someone who
  // isn't on this roster.
  it("drops student ids that aren't enrolled in the classroom", async () => {
    getClassroom.mockResolvedValue(classroomWith(["stu_1"]));
    await markAttendanceAction(formDataFor(["stu_1", "outsider"]));
    expect(markAttendance).toHaveBeenCalledWith("tenant_1", "ls_1", [
      { studentId: "stu_1", present: true, mode: "ONLINE" },
    ]);
  });

  it("refuses when none of the submitted students are enrolled", async () => {
    getClassroom.mockResolvedValue(classroomWith(["someone_else"]));
    const result = await markAttendanceAction(formDataFor(["outsider"]));
    expect(result.ok).toBe(false);
    expect(markAttendance).not.toHaveBeenCalled();
  });

  // FormData omits unchecked checkboxes entirely, so absence is the *absence*
  // of a field — the hidden studentIds input is what keeps the student in play.
  it("records an unchecked student as absent rather than skipping them", async () => {
    const fd = formDataFor(["stu_1"]);
    fd.delete("present:stu_1");
    await markAttendanceAction(fd);
    expect(markAttendance).toHaveBeenCalledWith("tenant_1", "ls_1", [
      { studentId: "stu_1", present: false, mode: "ONLINE" },
    ]);
  });

  it("rejects an unknown attendance mode", async () => {
    const fd = formDataFor(["stu_1"], { "mode:stu_1": "TELEPATHY" });
    const result = await markAttendanceAction(fd);
    expect(result.ok).toBe(false);
    expect(markAttendance).not.toHaveBeenCalled();
  });

  it("rejects an empty roster submission", async () => {
    const result = await markAttendanceAction(formDataFor([]));
    expect(result.ok).toBe(false);
    expect(markAttendance).not.toHaveBeenCalled();
  });
});
