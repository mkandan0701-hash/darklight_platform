import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncStudent } from "./gameSyncWorker";

vi.mock("../queues", () => ({ connection: {}, lichessSyncQueue: {}, chesscomSyncQueue: {} }));

const findSyncHandle = vi.fn();
const latestPlayedAt = vi.fn();
const persistSyncedGames = vi.fn();
vi.mock("../games/gameSync", () => ({
  findSyncHandle: (...a: unknown[]) => findSyncHandle(...a),
  latestPlayedAt: (...a: unknown[]) => latestPlayedAt(...a),
  persistSyncedGames: (...a: unknown[]) => persistSyncedGames(...a),
  listSyncTargets: vi.fn(),
}));

const fetchLichessGames = vi.fn();
vi.mock("../games/lichessGameSync", () => ({ fetchLichessGames: (...a: unknown[]) => fetchLichessGames(...a) }));
vi.mock("../games/chesscomGameSync", () => ({ fetchChesscomGames: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  latestPlayedAt.mockResolvedValue(undefined);
  fetchLichessGames.mockResolvedValue([]);
  persistSyncedGames.mockResolvedValue({ imported: 0 });
});

describe("syncStudent", () => {
  it("syncs the handle on the student's own row", async () => {
    findSyncHandle.mockResolvedValue("asha_plays");

    await syncStudent("LICHESS", { tenantId: "t1", studentId: "s1" });

    expect(findSyncHandle).toHaveBeenCalledWith("t1", "s1", "LICHESS");
    expect(fetchLichessGames).toHaveBeenCalledWith("asha_plays", { since: undefined });
  });

  // A student id from another tenant finds no row, so nothing is fetched or
  // written under the job's tenant.
  it("does nothing when the student isn't in the job's tenant", async () => {
    findSyncHandle.mockResolvedValue(null);

    const result = await syncStudent("LICHESS", { tenantId: "t1", studentId: "s_foreign" });

    expect(result).toEqual({ skipped: "no handle for this student in this tenant" });
    expect(fetchLichessGames).not.toHaveBeenCalled();
    expect(persistSyncedGames).not.toHaveBeenCalled();
  });
});
