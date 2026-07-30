import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthedSession } from "@chessplay-clone/shared";
import { registerLiveSessionHandlers } from "./rooms";

const liveSessionFindFirst = vi.fn();
const classroomCoachFindFirst = vi.fn();
const classroomStudentFindFirst = vi.fn();

vi.mock("@chessplay-clone/db", () => ({
  prisma: {
    liveSession: { findFirst: (...args: unknown[]) => liveSessionFindFirst(...args) },
    classroomCoach: { findFirst: (...args: unknown[]) => classroomCoachFindFirst(...args) },
    classroomStudent: {
      findFirst: (...args: unknown[]) => classroomStudentFindFirst(...args),
    },
  },
  runWithTenant: (_tenantId: string, fn: () => Promise<unknown>) => fn(),
}));

function createFakeSocket(session: AuthedSession) {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const rooms = new Set<string>();
  return {
    data: { session },
    rooms,
    on: (event: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(event, handler);
    },
    join: (room: string) => rooms.add(room),
    handlers,
  };
}

function createFakeIo() {
  const emitted: Array<{ room: string; event: string; payload: unknown }> = [];
  return {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        emitted.push({ room, event, payload });
      },
    }),
    emitted,
  };
}

const coach: AuthedSession = { userId: "coach_1", tenantId: "tenant_1", role: "COACH" };
const student: AuthedSession = {
  userId: "student_1",
  tenantId: "tenant_1",
  role: "STUDENT",
};

beforeEach(() => {
  liveSessionFindFirst.mockReset();
  classroomCoachFindFirst.mockReset();
  classroomStudentFindFirst.mockReset();
});

describe("join-room", () => {
  it("denies a student requesting the coach-only room", async () => {
    liveSessionFindFirst.mockResolvedValue({ classroomId: "classroom_1" });
    const socket = createFakeSocket(student);
    const io = createFakeIo();
    registerLiveSessionHandlers(io as never, socket as never);

    const ack = vi.fn();
    await socket.handlers.get("join-room")!(
      { liveSessionId: "ls_1", room: "coach" },
      ack
    );

    expect(ack).toHaveBeenCalledWith(false, "not authorized for this room");
    expect(socket.rooms.size).toBe(0);
    expect(classroomCoachFindFirst).not.toHaveBeenCalled();
  });

  it("allows a coach with classroom membership into the coach-only room", async () => {
    liveSessionFindFirst.mockResolvedValue({ classroomId: "classroom_1" });
    classroomCoachFindFirst.mockResolvedValue({ id: "membership_1" });
    const socket = createFakeSocket(coach);
    const io = createFakeIo();
    registerLiveSessionHandlers(io as never, socket as never);

    const ack = vi.fn();
    await socket.handlers.get("join-room")!(
      { liveSessionId: "ls_1", room: "coach" },
      ack
    );

    expect(ack).toHaveBeenCalledWith(true);
    expect(socket.rooms.has("session:ls_1:coach")).toBe(true);
  });

  it("denies a coach without classroom membership from the coach-only room", async () => {
    liveSessionFindFirst.mockResolvedValue({ classroomId: "classroom_1" });
    classroomCoachFindFirst.mockResolvedValue(null);
    const socket = createFakeSocket(coach);
    const io = createFakeIo();
    registerLiveSessionHandlers(io as never, socket as never);

    const ack = vi.fn();
    await socket.handlers.get("join-room")!(
      { liveSessionId: "ls_1", room: "coach" },
      ack
    );

    expect(ack).toHaveBeenCalledWith(false, "not authorized for this room");
    expect(socket.rooms.size).toBe(0);
  });

  it("denies access when the live session doesn't belong to the caller's tenant", async () => {
    liveSessionFindFirst.mockResolvedValue(null);
    const socket = createFakeSocket(coach);
    const io = createFakeIo();
    registerLiveSessionHandlers(io as never, socket as never);

    const ack = vi.fn();
    await socket.handlers.get("join-room")!(
      { liveSessionId: "ls_1", room: "shared" },
      ack
    );

    expect(ack).toHaveBeenCalledWith(false, "not authorized for this room");
  });

  it("allows an enrolled student into the shared room", async () => {
    liveSessionFindFirst.mockResolvedValue({ classroomId: "classroom_1" });
    classroomStudentFindFirst.mockResolvedValue({ id: "membership_1" });
    const socket = createFakeSocket(student);
    const io = createFakeIo();
    registerLiveSessionHandlers(io as never, socket as never);

    const ack = vi.fn();
    await socket.handlers.get("join-room")!(
      { liveSessionId: "ls_1", room: "shared" },
      ack
    );

    expect(ack).toHaveBeenCalledWith(true);
    expect(socket.rooms.has("session:ls_1")).toBe(true);
  });

  it("denies a non-enrolled student from the shared room", async () => {
    liveSessionFindFirst.mockResolvedValue({ classroomId: "classroom_1" });
    classroomStudentFindFirst.mockResolvedValue(null);
    const socket = createFakeSocket(student);
    const io = createFakeIo();
    registerLiveSessionHandlers(io as never, socket as never);

    const ack = vi.fn();
    await socket.handlers.get("join-room")!(
      { liveSessionId: "ls_1", room: "shared" },
      ack
    );

    expect(ack).toHaveBeenCalledWith(false, "not authorized for this room");
  });
});

describe("move", () => {
  it("rejects a move from a socket that hasn't joined the session's shared room", () => {
    const socket = createFakeSocket(student);
    const io = createFakeIo();
    registerLiveSessionHandlers(io as never, socket as never);

    const ack = vi.fn();
    socket.handlers.get("move")!(
      { liveSessionId: "move_not_joined", from: "e2", to: "e4" },
      ack
    );

    expect(ack).toHaveBeenCalledWith(false, undefined, "not joined to this session's room");
    expect(io.emitted).toHaveLength(0);
  });

  it("rejects an illegal move and does not broadcast it", () => {
    const socket = createFakeSocket(student);
    const io = createFakeIo();
    registerLiveSessionHandlers(io as never, socket as never);
    socket.join("session:move_illegal");

    const ack = vi.fn();
    // Pawns can't advance three squares — illegal from the starting position.
    socket.handlers.get("move")!(
      { liveSessionId: "move_illegal", from: "e2", to: "e5" },
      ack
    );

    expect(ack).toHaveBeenCalledWith(false, undefined, "illegal move");
    expect(io.emitted).toHaveLength(0);
  });

  it("server-validates a legal move and broadcasts the resulting FEN to the shared room only", () => {
    const socket = createFakeSocket(student);
    const io = createFakeIo();
    registerLiveSessionHandlers(io as never, socket as never);
    socket.join("session:move_legal");

    const ack = vi.fn();
    socket.handlers.get("move")!(
      { liveSessionId: "move_legal", from: "e2", to: "e4" },
      ack
    );

    expect(ack).toHaveBeenCalledWith(true, expect.stringContaining("rnbqkbnr"));
    expect(io.emitted).toHaveLength(1);
    expect(io.emitted[0].room).toBe("session:move_legal");
    expect(io.emitted[0].event).toBe("game-state");
  });
});

describe("ref-board-move", () => {
  it("rejects when the socket hasn't joined the coach-only room", () => {
    const socket = createFakeSocket(coach);
    const io = createFakeIo();
    registerLiveSessionHandlers(io as never, socket as never);

    const ack = vi.fn();
    socket.handlers.get("ref-board-move")!(
      { liveSessionId: "ref_1", from: "e2", to: "e4" },
      ack
    );

    expect(ack).toHaveBeenCalledWith(false);
    expect(io.emitted).toHaveLength(0);
  });

  it("broadcasts only to the coach-only room, never the shared room", () => {
    const socket = createFakeSocket(coach);
    const io = createFakeIo();
    registerLiveSessionHandlers(io as never, socket as never);
    socket.join("session:ref_2:coach");

    const ack = vi.fn();
    socket.handlers.get("ref-board-move")!(
      { liveSessionId: "ref_2", from: "e2", to: "e4" },
      ack
    );

    expect(ack).toHaveBeenCalledWith(true);
    expect(io.emitted).toHaveLength(1);
    expect(io.emitted[0].room).toBe("session:ref_2:coach");
    expect(io.emitted.some((e) => e.room === "session:ref_2")).toBe(false);
  });
});
