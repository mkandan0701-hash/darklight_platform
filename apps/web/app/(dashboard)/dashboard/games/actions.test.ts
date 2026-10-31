import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentSession = vi.fn();
const getGame = vi.fn();
const enqueueGameAnalysis = vi.fn();

vi.mock("../../../../lib/auth/session", () => ({
  getCurrentSession: () => getCurrentSession(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../../../repositories/gameRepository", () => ({
  getGame: (...a: unknown[]) => getGame(...a),
}));
vi.mock("../../../../lib/queues/analysisQueue", () => ({
  enqueueGameAnalysis: (...a: unknown[]) => enqueueGameAnalysis(...a),
}));

const { requestGameAnalysisAction } = await import("./actions");

const sessionAs = (role: string) => ({
  id: "user_1",
  tenantId: "tenant_1",
  role,
  email: "c@x.test",
  timezone: "UTC",
});

function form(gameId = "game_1") {
  const fd = new FormData();
  fd.set("gameId", gameId);
  return fd;
}

beforeEach(() => {
  [getCurrentSession, getGame, enqueueGameAnalysis].forEach((m) => m.mockReset());
  getCurrentSession.mockResolvedValue(sessionAs("COACH"));
  getGame.mockResolvedValue({ id: "game_1" });
  enqueueGameAnalysis.mockResolvedValue(undefined);
});

describe("requestGameAnalysisAction", () => {
  it("refuses students and parents — analysis is minutes of CPU per game", async () => {
    for (const role of ["STUDENT", "PARENT"]) {
      getCurrentSession.mockResolvedValue(sessionAs(role));
      expect(await requestGameAnalysisAction(form())).toMatchObject({ ok: false });
      expect(enqueueGameAnalysis).not.toHaveBeenCalled();
    }
  });

  it("queues the job for an assigned coach", async () => {
    expect(await requestGameAnalysisAction(form())).toEqual({ ok: true });
    expect(enqueueGameAnalysis).toHaveBeenCalledWith({
      tenantId: "tenant_1",
      gameId: "game_1",
    });
  });

  // The gameId is form input: without this check a coach could spend the
  // academy's engine time on another tenant's game, and learn its id exists.
  it("refuses a game that is not this academy's", async () => {
    getGame.mockResolvedValue(null);
    expect(await requestGameAnalysisAction(form("someone_elses"))).toEqual({
      ok: false,
      error: "Game not found",
    });
    expect(enqueueGameAnalysis).not.toHaveBeenCalled();
  });

  it("reports a queue outage as an outage rather than a silent no-op", async () => {
    enqueueGameAnalysis.mockRejectedValue(new Error("redis down"));
    expect(await requestGameAnalysisAction(form())).toEqual({
      ok: false,
      error: "Analysis queue is unavailable — please try again later",
    });
  });
});
