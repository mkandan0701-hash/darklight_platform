import { beforeEach, describe, expect, it, vi } from "vitest";
import { TenantMismatchError } from "../../../../lib/auth/errors";

const getCurrentSession = vi.fn();
const createSimulWithBoards = vi.fn();
const getCoachProfileByUserId = vi.fn();

vi.mock("../../../../lib/auth/session", () => ({
  getCurrentSession: () => getCurrentSession(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../../../repositories/simulRepository", () => ({
  createSimulWithBoards: (...a: unknown[]) => createSimulWithBoards(...a),
}));
vi.mock("../../../../repositories/userRepository", () => ({
  getCoachProfileByUserId: (...a: unknown[]) => getCoachProfileByUserId(...a),
}));

const { createSimulAction } = await import("./actions");

const sessionAs = (role: string) => ({
  id: "user_1",
  tenantId: "tenant_1",
  role,
  email: "c@x.test",
  timezone: "Asia/Kolkata",
});

function form(studentIds: string[], startsLocal = "2026-10-03T10:00") {
  const fd = new FormData();
  fd.set("startsLocal", startsLocal);
  for (const id of studentIds) fd.append("studentIds", id);
  return fd;
}

beforeEach(() => {
  [getCurrentSession, createSimulWithBoards, getCoachProfileByUserId].forEach((m) => m.mockReset());
  getCurrentSession.mockResolvedValue(sessionAs("COACH"));
  getCoachProfileByUserId.mockResolvedValue({ id: "coach_1" });
  createSimulWithBoards.mockResolvedValue({ id: "simul_1" });
});

describe("createSimulAction", () => {
  // The exhibitor plays every board, so an admin creating one for themselves
  // would have no seat at it.
  it("refuses every role but coach, including admin", async () => {
    for (const role of ["ACADEMY_ADMIN", "STUDENT", "PARENT"]) {
      getCurrentSession.mockResolvedValue(sessionAs(role));
      expect(await createSimulAction(form(["s1"])), role).toMatchObject({ ok: false });
      expect(createSimulWithBoards).not.toHaveBeenCalled();
    }
  });

  it("creates one board per opponent, in the coach's timezone", async () => {
    expect(await createSimulAction(form(["s1", "s2"]))).toEqual({ ok: true });
    const arg = createSimulWithBoards.mock.calls[0][0];
    expect(arg).toMatchObject({
      tenantId: "tenant_1",
      coachId: "coach_1",
      studentIds: ["s1", "s2"],
    });
    // 10:00 IST is 04:30 UTC.
    expect(arg.startsAtUtc.toISOString()).toBe("2026-10-03T04:30:00.000Z");
  });

  // Two boards for one person is a game they cannot play.
  it("de-duplicates a student picked twice", async () => {
    await createSimulAction(form(["s1", "s1", "s2"]));
    expect(createSimulWithBoards.mock.calls[0][0].studentIds).toEqual(["s1", "s2"]);
  });

  it("refuses a simul with no opponents", async () => {
    expect(await createSimulAction(form([]))).toMatchObject({ ok: false });
    expect(createSimulWithBoards).not.toHaveBeenCalled();
  });

  it("refuses a coach with no coach profile on file", async () => {
    getCoachProfileByUserId.mockResolvedValue(null);
    expect(await createSimulAction(form(["s1"]))).toEqual({
      ok: false,
      error: "No coach profile found for your account",
    });
    expect(createSimulWithBoards).not.toHaveBeenCalled();
  });

  it("translates a cross-tenant student into a user-facing error", async () => {
    createSimulWithBoards.mockRejectedValue(new TenantMismatchError("nope"));
    expect(await createSimulAction(form(["s1"]))).toEqual({
      ok: false,
      error: "Those students aren't part of your academy",
    });
  });
});
