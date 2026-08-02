import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentSession = vi.fn();
const getLiveSession = vi.fn();
const getClassroom = vi.fn();

vi.mock("../auth/session", () => ({ getCurrentSession: () => getCurrentSession() }));
vi.mock("../../repositories/liveSessionRepository", () => ({
  getLiveSession: (...a: unknown[]) => getLiveSession(...a),
}));
vi.mock("../../repositories/classroomRepository", () => ({
  getClassroom: (...a: unknown[]) => getClassroom(...a),
}));

const { getIceServersAction } = await import("./actions");

const COACH_USER = "user_coach";
const STUDENT_USER = "user_student";

function classroomWith({ coachIds = [], studentIds = [] }: { coachIds?: string[]; studentIds?: string[] }) {
  return {
    coaches: coachIds.map((id) => ({ coach: { user: { id } } })),
    students: studentIds.map((id) => ({ student: { user: { id } } })),
  };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  [getCurrentSession, getLiveSession, getClassroom].forEach((m) => m.mockReset());
  getCurrentSession.mockResolvedValue({ id: COACH_USER, tenantId: "tenant_1", role: "COACH" });
  getLiveSession.mockResolvedValue({ id: "ls_1", classroomId: "c_1" });
  getClassroom.mockResolvedValue(classroomWith({ coachIds: [COACH_USER], studentIds: [STUDENT_USER] }));
});

describe("getIceServersAction authorization", () => {
  // TURN is metered bandwidth we pay for, so signed-in is not sufficient.
  it("refuses a signed-in user who isn't in this session's classroom", async () => {
    getCurrentSession.mockResolvedValue({ id: "outsider", tenantId: "tenant_1", role: "STUDENT" });
    await expect(getIceServersAction("ls_1")).rejects.toThrow("Not a participant");
  });

  it("refuses when the session doesn't exist in this tenant", async () => {
    getLiveSession.mockResolvedValue(null);
    await expect(getIceServersAction("ls_1")).rejects.toThrow("No such live session");
    expect(getClassroom).not.toHaveBeenCalled();
  });

  it("allows an assigned coach and an enrolled student", async () => {
    await expect(getIceServersAction("ls_1")).resolves.toBeDefined();

    getCurrentSession.mockResolvedValue({ id: STUDENT_USER, tenantId: "tenant_1", role: "STUDENT" });
    await expect(getIceServersAction("ls_1")).resolves.toBeDefined();
  });

  // Matches canAccessLiveSession in apps/api: an admin who isn't teaching or
  // enrolled can't join the room, so they get no credentials either.
  it("refuses an academy admin who is neither teaching nor enrolled", async () => {
    getCurrentSession.mockResolvedValue({
      id: "user_admin",
      tenantId: "tenant_1",
      role: "ACADEMY_ADMIN",
    });
    await expect(getIceServersAction("ls_1")).rejects.toThrow("Not a participant");
  });
});

describe("getIceServersAction TURN configuration", () => {
  it("returns STUN only when no relay is provisioned", async () => {
    const servers = await getIceServersAction("ls_1");
    expect(servers).toHaveLength(1);
    expect(servers[0].username).toBeUndefined();
    expect(String(servers[0].urls)).toContain("stun:");
  });

  it("still returns STUN only when a URL is set but the secret isn't", async () => {
    vi.stubEnv("TURN_URLS", "turn:relay.example:3478");
    const servers = await getIceServersAction("ls_1");
    expect(servers).toHaveLength(1);
  });

  it("appends a credentialled TURN server once both are set", async () => {
    vi.stubEnv("TURN_URLS", "turn:relay.example:3478,turns:relay.example:5349");
    vi.stubEnv("TURN_SECRET", "s3cret");

    const servers = await getIceServersAction("ls_1");
    expect(servers).toHaveLength(2);

    const turn = servers[1];
    expect(turn.urls).toEqual(["turn:relay.example:3478", "turns:relay.example:5349"]);
    expect(turn.credential).toEqual(expect.any(String));

    // username is "{expiry}:{userId}" and the expiry must be in the future,
    // or the relay rejects it on arrival.
    const [expiry, userId] = String(turn.username).split(":");
    expect(userId).toBe(COACH_USER);
    expect(Number(expiry)).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("honours TURN_TTL_SECONDS", async () => {
    vi.stubEnv("TURN_URLS", "turn:relay.example:3478");
    vi.stubEnv("TURN_SECRET", "s3cret");
    vi.stubEnv("TURN_TTL_SECONDS", "60");

    const servers = await getIceServersAction("ls_1");
    const expiry = Number(String(servers[1].username).split(":")[0]);
    const nowUnix = Math.floor(Date.now() / 1000);
    expect(expiry).toBeGreaterThan(nowUnix);
    expect(expiry).toBeLessThanOrEqual(nowUnix + 60);
  });

  // The secret is the whole security property — it must never be handed out.
  it("never returns the shared secret", async () => {
    vi.stubEnv("TURN_URLS", "turn:relay.example:3478");
    vi.stubEnv("TURN_SECRET", "s3cret");
    const servers = await getIceServersAction("ls_1");
    expect(JSON.stringify(servers)).not.toContain("s3cret");
  });
});
