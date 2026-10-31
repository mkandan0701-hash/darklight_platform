import { beforeEach, describe, expect, it, vi } from "vitest";
import { Chess } from "chess.js";

const findSimulBoard = vi.fn();
const findStudentProfileId = vi.fn();
const findCoachProfileId = vi.fn();

vi.mock("@chessplay-clone/db", () => ({
  runWithTenant: (_tenantId: string, fn: () => unknown) => fn(),
}));
vi.mock("../repositories/simulRepository", () => ({
  findSimulBoard: (...a: unknown[]) => findSimulBoard(...a),
  findStudentProfileId: (...a: unknown[]) => findStudentProfileId(...a),
}));
vi.mock("../repositories/liveSessionRepository", () => ({
  findCoachProfileId: (...a: unknown[]) => findCoachProfileId(...a),
}));

// Static import: apps/api compiles to commonjs, which has no top-level await.
// Safe because each factory above returns closures that dereference the
// vi.fn()s at call time, not at factory time.
import { registerSimulHandlers, simulBoardRoom } from "./simulRooms";

const START_FEN = new Chess().fen();

/** Minimal Socket.io doubles: enough to drive the handlers and read back. */
function harness(role: string, userId = "user_1") {
  const handlers = new Map<string, (raw: unknown, ack?: unknown) => unknown>();
  const rooms = new Set<string>();
  const emitted: { room: string; event: string; payload: unknown }[] = [];

  const socket = {
    rooms,
    data: {
      session: { tenantId: "tenant_1", role },
      appUser: { id: userId },
      displayName: "Someone",
    },
    on(event: string, handler: (raw: unknown, ack?: unknown) => unknown) {
      handlers.set(event, handler);
    },
    join(room: string) {
      rooms.add(room);
      return Promise.resolve();
    },
  };

  const io = {
    to(room: string) {
      return {
        emit(event: string, payload: unknown) {
          emitted.push({ room, event, payload });
        },
      };
    },
  };

  const store = new Map<string, string>();
  const boardStore = {
    async getFen(id: string) {
      return store.get(id) ?? START_FEN;
    },
    async compareAndSetFen(id: string, expected: string, next: string) {
      const current = store.get(id) ?? START_FEN;
      if (current !== expected) return false;
      store.set(id, next);
      return true;
    },
    async setFen(id: string, fen: string) {
      store.set(id, fen);
    },
    async clearFen(id: string) {
      store.delete(id);
    },
  };

  registerSimulHandlers(io as never, socket as never, { boardStore: boardStore as never });

  const call = (event: string, payload: unknown) =>
    new Promise<unknown[]>((resolve) => {
      const handler = handlers.get(event);
      if (!handler) throw new Error(`no handler for ${event}`);
      void handler(payload, (...ackArgs: unknown[]) => resolve(ackArgs));
    });

  return { call, rooms, emitted, store };
}

const board = {
  boardId: "board_1",
  simulId: "simul_1",
  boardIdx: 3,
  studentId: "stu_1",
  coachId: "coach_1",
};

beforeEach(() => {
  [findSimulBoard, findStudentProfileId, findCoachProfileId].forEach((m) => m.mockReset());
  findSimulBoard.mockResolvedValue(board);
  findCoachProfileId.mockResolvedValue("coach_1");
  findStudentProfileId.mockResolvedValue("stu_1");
});

describe("simulBoardRoom", () => {
  it("names one room per board, as the spec's simul:{simulId}:{boardIdx}", () => {
    expect(simulBoardRoom("simul_1", 3)).toBe("simul:simul_1:3");
  });
});

describe("join-simul-board", () => {
  it("admits the exhibition's own coach, as White", async () => {
    const { call, rooms } = harness("COACH");
    const [ok, payload] = await call("join-simul-board", { simulBoardId: "board_1" });
    expect(ok).toBe(true);
    expect(payload).toMatchObject({ color: "w", boardIdx: 3, fen: START_FEN });
    expect(rooms.has("simul:simul_1:3")).toBe(true);
  });

  it("admits the board's own student, as Black", async () => {
    const { call, rooms } = harness("STUDENT");
    const [ok, payload] = await call("join-simul-board", { simulBoardId: "board_1" });
    expect(ok).toBe(true);
    expect(payload).toMatchObject({ color: "b" });
    expect(rooms.has("simul:simul_1:3")).toBe(true);
  });

  // The bug this exists for: another student in the same exhibition holding
  // this board's id could otherwise sit down at it and move a piece.
  it("refuses a student who is not this board's student", async () => {
    findStudentProfileId.mockResolvedValue("someone_else");
    const { call, rooms } = harness("STUDENT");
    const [ok] = await call("join-simul-board", { simulBoardId: "board_1" });
    expect(ok).toBe(false);
    expect(rooms.size).toBe(0);
  });

  it("refuses a coach who is not giving this exhibition", async () => {
    findCoachProfileId.mockResolvedValue("another_coach");
    const { call, rooms } = harness("COACH");
    const [ok] = await call("join-simul-board", { simulBoardId: "board_1" });
    expect(ok).toBe(false);
    expect(rooms.size).toBe(0);
  });

  it("refuses roles with no seat at a board at all", async () => {
    for (const role of ["PARENT", "ACADEMY_ADMIN"]) {
      const { call, rooms } = harness(role);
      const [ok] = await call("join-simul-board", { simulBoardId: "board_1" });
      expect(ok, role).toBe(false);
      expect(rooms.size, role).toBe(0);
    }
  });

  it("refuses a board that does not exist in this tenant", async () => {
    findSimulBoard.mockResolvedValue(null);
    const { call } = harness("COACH");
    const [ok] = await call("join-simul-board", { simulBoardId: "nope" });
    expect(ok).toBe(false);
  });

  it("rejects a malformed payload before any lookup", async () => {
    const { call } = harness("COACH");
    const [ok] = await call("join-simul-board", { simulBoardId: "" });
    expect(ok).toBe(false);
    expect(findSimulBoard).not.toHaveBeenCalled();
  });
});

describe("simul-move", () => {
  async function joinedCoach() {
    const h = harness("COACH");
    await h.call("join-simul-board", { simulBoardId: "board_1" });
    return h;
  }

  it("validates and broadcasts a legal move to the board's room", async () => {
    const { call, emitted, store } = await joinedCoach();
    const [ok, fen] = await call("simul-move", {
      simulBoardId: "board_1",
      from: "e2",
      to: "e4",
    });

    expect(ok).toBe(true);
    expect(typeof fen).toBe("string");
    expect(emitted).toHaveLength(1);
    expect(emitted[0].room).toBe("simul:simul_1:3");
    expect(emitted[0].event).toBe("simul-board-state");
    expect(store.get("board_1")).toBe(fen);
  });

  it("rejects an illegal move and broadcasts nothing", async () => {
    const { call, emitted } = await joinedCoach();
    const [ok, , reason] = await call("simul-move", {
      simulBoardId: "board_1",
      from: "e2",
      to: "e5",
    });
    expect(ok).toBe(false);
    expect(reason).toBe("illegal move");
    expect(emitted).toHaveLength(0);
  });

  // Without the turn check a player could move their opponent's pieces, since
  // chess.js would happily accept a legal move for whoever is to move.
  it("refuses a move made out of turn", async () => {
    const { call, emitted } = await joinedCoach();
    // White (the coach) has not moved, so it is not Black's turn.
    const student = harness("STUDENT");
    await student.call("join-simul-board", { simulBoardId: "board_1" });
    const [ok, , reason] = await student.call("simul-move", {
      simulBoardId: "board_1",
      from: "e7",
      to: "e5",
    });
    expect(ok).toBe(false);
    expect(reason).toBe("not your turn");
    expect(emitted).toHaveLength(0);
  });

  it("refuses a move from a socket that never joined the board", async () => {
    const { call, emitted } = harness("COACH");
    const [ok, , reason] = await call("simul-move", {
      simulBoardId: "board_1",
      from: "e2",
      to: "e4",
    });
    expect(ok).toBe(false);
    expect(reason).toBe("not joined to this board");
    expect(emitted).toHaveLength(0);
  });

  it("re-checks authorization on every move, not just at join", async () => {
    const { call, emitted } = await joinedCoach();
    // Whatever changed — reassigned board, revoked coach — the next move must
    // not ride on the join that already happened.
    findSimulBoard.mockResolvedValue(null);
    const [ok] = await call("simul-move", { simulBoardId: "board_1", from: "e2", to: "e4" });
    expect(ok).toBe(false);
    expect(emitted).toHaveLength(0);
  });
});
