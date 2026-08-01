import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthedSession } from "@chessplay-clone/shared";
import { registerLiveSessionHandlers } from "./rooms";
import { createBoardStore, START_FEN } from "./boardStore";
import { createFakeRedis } from "./fakeRedis";
import type { SocketSessionData } from "./authenticate";

const liveSessionFindFirst = vi.fn();
const classroomCoachFindFirst = vi.fn();
const classroomStudentFindFirst = vi.fn();
const coachProfileFindFirst = vi.fn();
const referenceBoardFindFirst = vi.fn();
const referenceBoardUpsert = vi.fn();

vi.mock("@chessplay-clone/db", () => ({
  prisma: {
    liveSession: { findFirst: (...a: unknown[]) => liveSessionFindFirst(...a) },
    classroomCoach: { findFirst: (...a: unknown[]) => classroomCoachFindFirst(...a) },
    classroomStudent: { findFirst: (...a: unknown[]) => classroomStudentFindFirst(...a) },
    coachProfile: { findFirst: (...a: unknown[]) => coachProfileFindFirst(...a) },
    referenceBoard: {
      findFirst: (...a: unknown[]) => referenceBoardFindFirst(...a),
      upsert: (...a: unknown[]) => referenceBoardUpsert(...a),
    },
  },
  runWithTenant: (_tenantId: string, fn: () => Promise<unknown>) => fn(),
}));

const coachSession: AuthedSession = {
  userId: "auth_coach_1",
  tenantId: "tenant_1",
  role: "COACH",
};
const studentSession: AuthedSession = {
  userId: "auth_student_1",
  tenantId: "tenant_1",
  role: "STUDENT",
};

// The JWT's `sub` (AuthedSession.userId) is a Supabase auth id; CoachProfile
// and StudentProfile key off User.id. The two are deliberately different
// strings here so a handler that confuses them fails loudly.
const coachData: SocketSessionData = {
  session: coachSession,
  appUser: { id: "user_coach_1", email: "asha.rao@academy.test" },
  displayName: "asha.rao",
};
const studentData: SocketSessionData = {
  session: studentSession,
  appUser: { id: "user_student_1", email: "dev@academy.test" },
  displayName: "dev",
};

function createFakeSocket(data: SocketSessionData) {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const rooms = new Set<string>();
  const selfEmitted: Array<{ event: string; payload: unknown }> = [];
  return {
    data: { ...data },
    rooms,
    on: (event: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(event, handler);
    },
    join: (room: string) => rooms.add(room),
    emit: (event: string, payload: unknown) => selfEmitted.push({ event, payload }),
    handlers,
    selfEmitted,
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

function setup(data: SocketSessionData) {
  const socket = createFakeSocket(data);
  const io = createFakeIo();
  const boardStore = createBoardStore(createFakeRedis() as never);
  registerLiveSessionHandlers(io as never, socket as never, { boardStore });
  return { socket, io, boardStore };
}

/** Every payload the shared-room handlers reject before doing any work. */
const malformedPayloads: Array<[string, unknown]> = [
  ["missing liveSessionId", { from: "e2", to: "e4" }],
  ["non-square from", { liveSessionId: "ls_1", from: "z9", to: "e4" }],
  ["numeric square", { liveSessionId: "ls_1", from: 22, to: "e4" }],
  ["not an object", "e2e4"],
];

beforeEach(() => {
  liveSessionFindFirst.mockReset();
  classroomCoachFindFirst.mockReset();
  classroomStudentFindFirst.mockReset();
  coachProfileFindFirst.mockReset();
  referenceBoardFindFirst.mockReset();
  referenceBoardUpsert.mockReset();
  referenceBoardFindFirst.mockResolvedValue(null);
  coachProfileFindFirst.mockResolvedValue({ id: "coach_profile_1" });
});

describe("join-room", () => {
  it("denies a student requesting the coach-only room", async () => {
    liveSessionFindFirst.mockResolvedValue({ classroomId: "classroom_1" });
    const { socket, io } = setup(studentData);

    const ack = vi.fn();
    await socket.handlers.get("join-room")!({ liveSessionId: "ls_1", room: "coach" }, ack);

    expect(ack).toHaveBeenCalledWith(false, undefined, "not authorized for this room");
    expect(socket.rooms.size).toBe(0);
    expect(classroomCoachFindFirst).not.toHaveBeenCalled();
    expect(io.emitted).toHaveLength(0);
  });

  it("allows a coach with classroom membership into the coach-only room", async () => {
    liveSessionFindFirst.mockResolvedValue({ classroomId: "classroom_1" });
    classroomCoachFindFirst.mockResolvedValue({ id: "membership_1" });
    const { socket } = setup(coachData);

    const ack = vi.fn();
    await socket.handlers.get("join-room")!({ liveSessionId: "ls_1", room: "coach" }, ack);

    expect(ack).toHaveBeenCalledWith(true, START_FEN);
    expect(socket.rooms.has("session:ls_1:coach")).toBe(true);
  });

  // Regression: membership was matched with `coach: { userId: session.userId }`,
  // where session.userId is the Supabase auth id and CoachProfile.userId is a
  // User.id. The filter could never match, so every join was denied — and the
  // old test could not see it, because it only asserted on the mock's return
  // value and never on the `where` clause.
  it("matches classroom membership on User.id, not the Supabase auth id", async () => {
    liveSessionFindFirst.mockResolvedValue({ classroomId: "classroom_1" });
    classroomCoachFindFirst.mockResolvedValue({ id: "membership_1" });
    const { socket } = setup(coachData);

    await socket.handlers.get("join-room")!({ liveSessionId: "ls_1", room: "coach" }, vi.fn());

    expect(classroomCoachFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant_1",
          classroomId: "classroom_1",
          coach: { userId: "user_coach_1" },
        }),
      })
    );
  });

  it("denies a coach without classroom membership from the coach-only room", async () => {
    liveSessionFindFirst.mockResolvedValue({ classroomId: "classroom_1" });
    classroomCoachFindFirst.mockResolvedValue(null);
    const { socket } = setup(coachData);

    const ack = vi.fn();
    await socket.handlers.get("join-room")!({ liveSessionId: "ls_1", room: "coach" }, ack);

    expect(ack).toHaveBeenCalledWith(false, undefined, "not authorized for this room");
    expect(socket.rooms.size).toBe(0);
  });

  it("denies access when the live session doesn't belong to the caller's tenant", async () => {
    liveSessionFindFirst.mockResolvedValue(null);
    const { socket } = setup(coachData);

    const ack = vi.fn();
    await socket.handlers.get("join-room")!({ liveSessionId: "ls_1", room: "shared" }, ack);

    expect(ack).toHaveBeenCalledWith(false, undefined, "not authorized for this room");
  });

  it("allows an enrolled student into the shared room", async () => {
    liveSessionFindFirst.mockResolvedValue({ classroomId: "classroom_1" });
    classroomStudentFindFirst.mockResolvedValue({ id: "membership_1" });
    const { socket } = setup(studentData);

    const ack = vi.fn();
    await socket.handlers.get("join-room")!({ liveSessionId: "ls_1", room: "shared" }, ack);

    expect(ack).toHaveBeenCalledWith(true, START_FEN);
    expect(socket.rooms.has("session:ls_1")).toBe(true);
  });

  it("denies a non-enrolled student from the shared room", async () => {
    liveSessionFindFirst.mockResolvedValue({ classroomId: "classroom_1" });
    classroomStudentFindFirst.mockResolvedValue(null);
    const { socket } = setup(studentData);

    const ack = vi.fn();
    await socket.handlers.get("join-room")!({ liveSessionId: "ls_1", room: "shared" }, ack);

    expect(ack).toHaveBeenCalledWith(false, undefined, "not authorized for this room");
  });

  it("rejects a malformed join payload without touching the database", async () => {
    const { socket } = setup(coachData);

    const ack = vi.fn();
    await socket.handlers.get("join-room")!({ liveSessionId: "ls_1", room: "spectator" }, ack);

    expect(ack).toHaveBeenCalledWith(false, undefined, "invalid payload");
    expect(liveSessionFindFirst).not.toHaveBeenCalled();
  });

  // Regression: join acked `true` with no state, so a client that joined after
  // play had started saw a fresh board until somebody moved.
  it("hydrates a late joiner with the current position", async () => {
    liveSessionFindFirst.mockResolvedValue({ classroomId: "classroom_1" });
    classroomStudentFindFirst.mockResolvedValue({ id: "membership_1" });
    classroomCoachFindFirst.mockResolvedValue({ id: "membership_1" });
    const { socket, boardStore } = setup(studentData);
    await boardStore.setFen("ls_late", "8/8/8/8/8/8/8/K6k w - - 0 1");

    const ack = vi.fn();
    await socket.handlers.get("join-room")!({ liveSessionId: "ls_late", room: "shared" }, ack);

    expect(ack).toHaveBeenCalledWith(true, "8/8/8/8/8/8/8/K6k w - - 0 1");
    expect(socket.selfEmitted).toContainEqual({
      event: "game-state",
      payload: { fen: "8/8/8/8/8/8/8/K6k w - - 0 1" },
    });
  });

  it("hydrates a joining coach from the persisted reference board", async () => {
    liveSessionFindFirst.mockResolvedValue({ classroomId: "classroom_1" });
    classroomCoachFindFirst.mockResolvedValue({ id: "membership_1" });
    referenceBoardFindFirst.mockResolvedValue({ fen: "8/8/8/8/8/8/8/K6k w - - 0 1" });
    const { socket } = setup(coachData);

    await socket.handlers.get("join-room")!({ liveSessionId: "ls_ref", room: "coach" }, vi.fn());

    expect(socket.selfEmitted).toContainEqual({
      event: "ref-board-state",
      payload: { fen: "8/8/8/8/8/8/8/K6k w - - 0 1" },
    });
  });
});

describe("move", () => {
  it("rejects a move from a socket that hasn't joined the session's shared room", async () => {
    const { socket, io } = setup(studentData);

    const ack = vi.fn();
    await socket.handlers.get("move")!({ liveSessionId: "m1", from: "e2", to: "e4" }, ack);

    expect(ack).toHaveBeenCalledWith(false, undefined, "not joined to this session's room");
    expect(io.emitted).toHaveLength(0);
  });

  it("rejects an illegal move and does not broadcast it", async () => {
    const { socket, io } = setup(studentData);
    socket.join("session:m2");

    const ack = vi.fn();
    // Pawns can't advance three squares — illegal from the starting position.
    await socket.handlers.get("move")!({ liveSessionId: "m2", from: "e2", to: "e5" }, ack);

    expect(ack).toHaveBeenCalledWith(false, START_FEN, "illegal move");
    expect(io.emitted).toHaveLength(0);
  });

  it("server-validates a legal move and broadcasts to the shared room only", async () => {
    const { socket, io } = setup(studentData);
    socket.join("session:m3");

    const ack = vi.fn();
    await socket.handlers.get("move")!({ liveSessionId: "m3", from: "e2", to: "e4" }, ack);

    expect(ack).toHaveBeenCalledWith(true, expect.stringContaining("rnbqkbnr"));
    expect(io.emitted).toHaveLength(1);
    expect(io.emitted[0].room).toBe("session:m3");
    expect(io.emitted[0].event).toBe("game-state");
  });

  it("persists the position so a second move builds on the first", async () => {
    const { socket, boardStore } = setup(studentData);
    socket.join("session:m4");

    await socket.handlers.get("move")!({ liveSessionId: "m4", from: "e2", to: "e4" }, vi.fn());
    await socket.handlers.get("move")!({ liveSessionId: "m4", from: "e7", to: "e5" }, vi.fn());

    const fen = await boardStore.getFen("m4");
    expect(fen).toContain("4p3");
    expect(fen).toContain("4P3");
  });

  it.each(malformedPayloads)("rejects a malformed move payload (%s)", async (_label, payload) => {
    const { socket, io } = setup(studentData);
    socket.join("session:ls_1");

    const ack = vi.fn();
    await socket.handlers.get("move")!(payload, ack);

    expect(ack).toHaveBeenCalledWith(false, undefined, "invalid payload");
    expect(io.emitted).toHaveLength(0);
  });
});

describe("arrows and flip", () => {
  it("lets a student draw an arrow, stamped with the server's identity", () => {
    const { socket, io } = setup(studentData);
    socket.join("session:a1");

    const ack = vi.fn();
    socket.handlers.get("draw-arrow")!({ liveSessionId: "a1", from: "e2", to: "e4" }, ack);

    expect(ack).toHaveBeenCalledWith(true);
    expect(io.emitted[0]).toEqual({
      room: "session:a1",
      event: "draw-arrow",
      payload: {
        from: "e2",
        to: "e4",
        authorUserId: "user_student_1",
        authorRole: "STUDENT",
      },
    });
  });

  it("ignores a client-supplied author and uses the session instead", () => {
    const { socket, io } = setup(studentData);
    socket.join("session:a2");

    socket.handlers.get("draw-arrow")!(
      {
        liveSessionId: "a2",
        from: "e2",
        to: "e4",
        authorUserId: "user_coach_1",
        authorRole: "COACH",
      },
      vi.fn()
    );

    expect(io.emitted[0].payload).toMatchObject({
      authorUserId: "user_student_1",
      authorRole: "STUDENT",
    });
  });

  it("refuses to clear arrows for a student but allows a coach", () => {
    const studentSetup = setup(studentData);
    studentSetup.socket.join("session:a3");
    const studentAck = vi.fn();
    studentSetup.socket.handlers.get("clear-arrows")!({ liveSessionId: "a3" }, studentAck);

    expect(studentAck).toHaveBeenCalledWith(false, "only a coach can clear arrows");
    expect(studentSetup.io.emitted).toHaveLength(0);

    const coachSetup = setup(coachData);
    coachSetup.socket.join("session:a3");
    const coachAck = vi.fn();
    coachSetup.socket.handlers.get("clear-arrows")!({ liveSessionId: "a3" }, coachAck);

    expect(coachAck).toHaveBeenCalledWith(true);
    expect(coachSetup.io.emitted[0].event).toBe("clear-arrows");
  });

  it("refuses to flip the shared board for a student but allows a coach", () => {
    const studentSetup = setup(studentData);
    studentSetup.socket.join("session:a4");
    const studentAck = vi.fn();
    studentSetup.socket.handlers.get("flip-board")!({ liveSessionId: "a4" }, studentAck);

    expect(studentAck).toHaveBeenCalledWith(false, "only a coach can flip the shared board");
    expect(studentSetup.io.emitted).toHaveLength(0);

    const coachSetup = setup(coachData);
    coachSetup.socket.join("session:a4");
    coachSetup.socket.handlers.get("flip-board")!({ liveSessionId: "a4" }, vi.fn());

    expect(coachSetup.io.emitted[0].event).toBe("flip-board");
  });

  it("rejects an arrow from a socket that never joined the room", () => {
    const { socket, io } = setup(studentData);

    const ack = vi.fn();
    socket.handlers.get("draw-arrow")!({ liveSessionId: "a5", from: "e2", to: "e4" }, ack);

    expect(ack).toHaveBeenCalledWith(false, "not joined to this session's room");
    expect(io.emitted).toHaveLength(0);
  });
});

describe("chat-message", () => {
  it("stamps author identity and a UTC timestamp", () => {
    const { socket, io } = setup(studentData);
    socket.join("session:c1");

    const ack = vi.fn();
    socket.handlers.get("chat-message")!({ liveSessionId: "c1", body: "  why not Nf3?  " }, ack);

    expect(ack).toHaveBeenCalledWith(true);
    const payload = io.emitted[0].payload as Record<string, string>;
    expect(io.emitted[0].room).toBe("session:c1");
    expect(payload.body).toBe("why not Nf3?");
    expect(payload.authorUserId).toBe("user_student_1");
    expect(payload.authorName).toBe("dev");
    expect(payload.authorRole).toBe("STUDENT");
    expect(payload.sentAtUtc).toMatch(/Z$/);
  });

  it("rejects an empty or oversized message", () => {
    const { socket, io } = setup(studentData);
    socket.join("session:c2");

    const emptyAck = vi.fn();
    socket.handlers.get("chat-message")!({ liveSessionId: "c2", body: "   " }, emptyAck);
    expect(emptyAck).toHaveBeenCalledWith(false, "invalid message");

    const longAck = vi.fn();
    socket.handlers.get("chat-message")!(
      { liveSessionId: "c2", body: "x".repeat(1001) },
      longAck
    );
    expect(longAck).toHaveBeenCalledWith(false, "invalid message");

    expect(io.emitted).toHaveLength(0);
  });

  it("rejects chat from a socket that never joined the room", () => {
    const { socket, io } = setup(studentData);

    const ack = vi.fn();
    socket.handlers.get("chat-message")!({ liveSessionId: "c3", body: "hello" }, ack);

    expect(ack).toHaveBeenCalledWith(false, "not joined to this session's room");
    expect(io.emitted).toHaveLength(0);
  });
});

describe("reference board", () => {
  it("rejects a ref move when the socket hasn't joined the coach-only room", async () => {
    const { socket, io } = setup(coachData);

    const ack = vi.fn();
    await socket.handlers.get("ref-board-move")!(
      { liveSessionId: "r1", from: "e2", to: "e4" },
      ack
    );

    expect(ack).toHaveBeenCalledWith(false, "not joined to this session's coach room");
    expect(io.emitted).toHaveLength(0);
  });

  it("broadcasts only to the coach-only room, never the shared room", async () => {
    const { socket, io } = setup(coachData);
    socket.join("session:r2:coach");

    const ack = vi.fn();
    await socket.handlers.get("ref-board-move")!(
      { liveSessionId: "r2", from: "e2", to: "e4" },
      ack
    );

    expect(ack).toHaveBeenCalledWith(true);
    expect(io.emitted).toHaveLength(1);
    expect(io.emitted[0].room).toBe("session:r2:coach");
    expect(io.emitted.some((e) => e.room === "session:r2")).toBe(false);
  });

  // Regression: ref-board-move was a blind relay, so an illegal move was
  // rebroadcast and every coach client diverged from the persisted position.
  it("rejects an illegal ref move now that the position is persisted", async () => {
    const { socket, io } = setup(coachData);
    socket.join("session:r3:coach");

    const ack = vi.fn();
    await socket.handlers.get("ref-board-move")!(
      { liveSessionId: "r3", from: "e2", to: "e5" },
      ack
    );

    expect(ack).toHaveBeenCalledWith(false, "illegal move");
    expect(io.emitted).toHaveLength(0);
    expect(referenceBoardUpsert).not.toHaveBeenCalled();
  });

  it("persists a loaded FEN against the coach's profile id", async () => {
    const { socket, io } = setup(coachData);
    socket.join("session:r4:coach");
    const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3";

    const ack = vi.fn();
    await socket.handlers.get("ref-board-load")!({ liveSessionId: "r4", fen }, ack);

    expect(ack).toHaveBeenCalledWith(true);
    expect(referenceBoardUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { liveSessionId: "r4" },
        create: expect.objectContaining({
          tenantId: "tenant_1",
          coachId: "coach_profile_1",
          fen,
        }),
      })
    );
    expect(io.emitted[0].room).toBe("session:r4:coach");
  });

  it("rejects an invalid FEN without persisting anything", async () => {
    const { socket, io } = setup(coachData);
    socket.join("session:r5:coach");

    const ack = vi.fn();
    await socket.handlers.get("ref-board-load")!(
      { liveSessionId: "r5", fen: "not a position" },
      ack
    );

    expect(ack).toHaveBeenCalledWith(false, "invalid FEN");
    expect(referenceBoardUpsert).not.toHaveBeenCalled();
    expect(io.emitted).toHaveLength(0);
  });

  it("resets to the start position on clear", async () => {
    const { socket, io, boardStore } = setup(coachData);
    socket.join("session:r6:coach");
    await boardStore.setFen("r6", "8/8/8/8/8/8/8/K6k w - - 0 1", "ref");

    const ack = vi.fn();
    await socket.handlers.get("ref-board-clear")!({ liveSessionId: "r6" }, ack);

    expect(ack).toHaveBeenCalledWith(true);
    expect(await boardStore.getFen("r6", "ref")).toBe(START_FEN);
    expect(io.emitted[0]).toEqual({
      room: "session:r6:coach",
      event: "ref-board-state",
      payload: { fen: START_FEN },
    });
  });

  it("keeps the reference board separate from the shared board", async () => {
    const { socket, boardStore } = setup(coachData);
    socket.join("session:r7:coach");
    socket.join("session:r7");

    await socket.handlers.get("move")!({ liveSessionId: "r7", from: "d2", to: "d4" }, vi.fn());
    await socket.handlers.get("ref-board-move")!(
      { liveSessionId: "r7", from: "e2", to: "e4" },
      vi.fn()
    );

    expect(await boardStore.getFen("r7")).toContain("3P4");
    expect(await boardStore.getFen("r7", "ref")).toContain("4P3");
  });

  // The guarantee in CLAUDE.md §3.4, asserted across every reference-board event.
  it("never emits any reference-board event to the shared room", async () => {
    const { socket, io } = setup(coachData);
    socket.join("session:r8:coach");
    socket.join("session:r8");

    await socket.handlers.get("ref-board-load")!(
      { liveSessionId: "r8", fen: "8/8/8/8/8/8/8/K6k w - - 0 1" },
      vi.fn()
    );
    await socket.handlers.get("ref-board-clear")!({ liveSessionId: "r8" }, vi.fn());
    await socket.handlers.get("ref-board-move")!(
      { liveSessionId: "r8", from: "e2", to: "e4" },
      vi.fn()
    );

    expect(io.emitted.length).toBeGreaterThan(0);
    expect(io.emitted.every((e) => e.room === "session:r8:coach")).toBe(true);
  });
});
