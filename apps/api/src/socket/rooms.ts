import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { runWithTenant } from "@chessplay-clone/db";
import type { AuthedSession } from "@chessplay-clone/shared";
import {
  findCoachProfileId,
  findLiveSessionClassroomId,
  isClassroomCoach,
  isClassroomStudent,
} from "../repositories/liveSessionRepository";
import {
  findReferenceBoardFen,
  upsertReferenceBoardFen,
} from "../repositories/referenceBoardRepository";
import { START_FEN, type BoardStore } from "./boardStore";
import { safeLoadFen, safeMove } from "./chess";
import type { SocketSessionData } from "./authenticate";
import {
  audioJoinSchema,
  audioLeaveSchema,
  audioSignalSchema,
  chatMessageSchema,
  clearArrowsSchema,
  drawArrowSchema,
  flipBoardSchema,
  joinRoomSchema,
  moveSchema,
  refBoardClearSchema,
  refBoardLoadSchema,
  refBoardMoveSchema,
} from "./schemas";

type AuthedSocket = Socket & { data: SocketSessionData };
type Ack = (ok: boolean, ...rest: unknown[]) => void;

export type LiveSessionDeps = { boardStore: BoardStore };

export function sharedRoom(roomId: string) {
  return `session:${roomId}`;
}
export function coachRoom(roomId: string) {
  return `session:${roomId}:coach`;
}
// Audio is a sub-room of the shared room: everyone in the lesson may speak,
// but joining the board doesn't put you on a live mic. Never the coach room —
// the reference board is prep material, not a side channel.
export function audioRoom(roomId: string) {
  return `session:${roomId}:audio`;
}

async function canAccessLiveSession(
  session: AuthedSession,
  appUserId: string,
  liveSessionId: string,
  wantsCoachRoom: boolean
): Promise<boolean> {
  const classroomId = await findLiveSessionClassroomId(
    session.tenantId,
    liveSessionId
  );
  if (!classroomId) return false;

  if (wantsCoachRoom) {
    if (session.role !== "COACH") return false;
    return isClassroomCoach(session.tenantId, classroomId, appUserId);
  }

  if (session.role === "COACH") {
    return isClassroomCoach(session.tenantId, classroomId, appUserId);
  }
  return isClassroomStudent(session.tenantId, classroomId, appUserId);
}

export function registerLiveSessionHandlers(
  io: Server,
  socket: AuthedSocket,
  deps: LiveSessionDeps
) {
  const { boardStore } = deps;
  const { session, appUser, displayName } = socket.data;

  /** True only if this socket previously passed the join authorization check. */
  function inRoom(room: string): boolean {
    return socket.rooms.has(room);
  }

  async function coachProfileId(): Promise<string | null> {
    if (socket.data.coachProfileId !== undefined) {
      return socket.data.coachProfileId;
    }
    const id = await runWithTenant(session.tenantId, () =>
      findCoachProfileId(session.tenantId, appUser.id)
    );
    socket.data.coachProfileId = id;
    return id;
  }

  socket.on("join-room", async (raw: unknown, ack?: Ack) => {
    const parsed = joinRoomSchema.safeParse(raw);
    if (!parsed.success) {
      ack?.(false, undefined, "invalid payload");
      return;
    }
    const { liveSessionId, room } = parsed.data;
    const wantsCoachRoom = room === "coach";

    // Scope the membership queries to the socket's authenticated tenant so
    // tenantScope verifies the tenantId filters rather than trusting them.
    const allowed = await runWithTenant(session.tenantId, () =>
      canAccessLiveSession(session, appUser.id, liveSessionId, wantsCoachRoom)
    );
    if (!allowed) {
      ack?.(false, undefined, "not authorized for this room");
      return;
    }

    if (wantsCoachRoom) {
      socket.join(coachRoom(liveSessionId));
      // Postgres is the durable record for the reference board — a coach can
      // set a position up the night before — so it wins over Redis on join,
      // and warms Redis for the rest of the lesson.
      const stored = await runWithTenant(session.tenantId, () =>
        findReferenceBoardFen(session.tenantId, liveSessionId)
      );
      if (stored) {
        await boardStore.setFen(liveSessionId, stored, "ref");
      }
      const fen = stored ?? (await boardStore.getFen(liveSessionId, "ref"));
      // Hydrate this socket alone. Without it a coach reopening a session
      // stares at a fresh board until they touch a piece.
      socket.emit("ref-board-state", { fen });
      ack?.(true, fen);
      return;
    }

    socket.join(sharedRoom(liveSessionId));
    const fen = await boardStore.getFen(liveSessionId);
    socket.emit("game-state", { fen });
    ack?.(true, fen);
  });

  // ---------------------------------------------------------------------
  // Shared room. Identity on every broadcast is stamped from the socket's
  // verified session — the payload schemas reject author fields outright, so
  // a client cannot claim to be someone else.
  // ---------------------------------------------------------------------

  socket.on("move", async (raw: unknown, ack?: Ack) => {
    const parsed = moveSchema.safeParse(raw);
    if (!parsed.success) {
      ack?.(false, undefined, "invalid payload");
      return;
    }
    const { liveSessionId, from, to, promotion } = parsed.data;
    const room = sharedRoom(liveSessionId);
    if (!inRoom(room)) {
      ack?.(false, undefined, "not joined to this session's room");
      return;
    }

    const currentFen = await boardStore.getFen(liveSessionId);
    const game = safeLoadFen(currentFen);
    if (!game) {
      ack?.(false, undefined, "board state unreadable");
      return;
    }

    // Re-validated server-side against the authoritative position before it
    // reaches anyone else (CLAUDE.md §3.3). A rejected move is never broadcast.
    const move = safeMove(game, { from, to, promotion });
    if (!move) {
      ack?.(false, currentFen, "illegal move");
      return;
    }

    const nextFen = game.fen();
    const won = await boardStore.compareAndSetFen(
      liveSessionId,
      currentFen,
      nextFen
    );
    if (!won) {
      // Someone else moved between our read and our write. Hand the client the
      // real position instead of broadcasting a move built on a stale one.
      const latest = await boardStore.getFen(liveSessionId);
      ack?.(false, latest, "position changed, resync");
      return;
    }

    io.to(room).emit("game-state", { fen: nextFen, lastMove: move });
    ack?.(true, nextFen);
  });

  socket.on("draw-arrow", (raw: unknown, ack?: Ack) => {
    const parsed = drawArrowSchema.safeParse(raw);
    if (!parsed.success) {
      ack?.(false, "invalid payload");
      return;
    }
    const { liveSessionId, from, to } = parsed.data;
    const room = sharedRoom(liveSessionId);
    if (!inRoom(room)) {
      ack?.(false, "not joined to this session's room");
      return;
    }
    // Students may draw too — "show me what you'd play" is the point of the
    // feature — but the UI colours by role, so who drew it has to be
    // trustworthy. Hence stamped here, not read from the payload.
    io.to(room).emit("draw-arrow", {
      from,
      to,
      authorUserId: appUser.id,
      authorRole: session.role,
    });
    ack?.(true);
  });

  socket.on("clear-arrows", (raw: unknown, ack?: Ack) => {
    const parsed = clearArrowsSchema.safeParse(raw);
    if (!parsed.success) {
      ack?.(false, "invalid payload");
      return;
    }
    const room = sharedRoom(parsed.data.liveSessionId);
    if (!inRoom(room)) {
      ack?.(false, "not joined to this session's room");
      return;
    }
    // Wiping the board is a lesson-driving action: coach only, so a student
    // can't erase the coach's annotation mid-explanation.
    if (session.role !== "COACH") {
      ack?.(false, "only a coach can clear arrows");
      return;
    }
    io.to(room).emit("clear-arrows", {});
    ack?.(true);
  });

  socket.on("flip-board", (raw: unknown, ack?: Ack) => {
    const parsed = flipBoardSchema.safeParse(raw);
    if (!parsed.success) {
      ack?.(false, "invalid payload");
      return;
    }
    const room = sharedRoom(parsed.data.liveSessionId);
    if (!inRoom(room)) {
      ack?.(false, "not joined to this session's room");
      return;
    }
    // Coach only, because this moves *everyone's* board. A student who just
    // wants to look from the other side flips locally in the UI and emits
    // nothing.
    if (session.role !== "COACH") {
      ack?.(false, "only a coach can flip the shared board");
      return;
    }
    io.to(room).emit("flip-board", {});
    ack?.(true);
  });

  socket.on("chat-message", (raw: unknown, ack?: Ack) => {
    const parsed = chatMessageSchema.safeParse(raw);
    if (!parsed.success) {
      ack?.(false, "invalid message");
      return;
    }
    const { liveSessionId, body } = parsed.data;
    const room = sharedRoom(liveSessionId);
    if (!inRoom(room)) {
      ack?.(false, "not joined to this session's room");
      return;
    }
    io.to(room).emit("chat-message", {
      id: randomUUID(),
      body,
      authorUserId: appUser.id,
      authorRole: session.role,
      authorName: displayName,
      // UTC on the wire; each client renders it in its own viewer's zone
      // (CLAUDE.md §3.5).
      sentAtUtc: new Date().toISOString(),
    });
    ack?.(true);
  });

  // ---------------------------------------------------------------------
  // Audio (WebRTC signalling). The server never sees or relays media — it
  // only brokers the offer/answer/ICE exchange so two browsers can connect
  // directly. Peer identity is the socket id.
  // ---------------------------------------------------------------------

  socket.on("audio-join", (raw: unknown, ack?: Ack) => {
    const parsed = audioJoinSchema.safeParse(raw);
    if (!parsed.success) {
      ack?.(false, undefined, "invalid payload");
      return;
    }
    const { liveSessionId } = parsed.data;
    // Being on the shared board is the prerequisite, so audio inherits the
    // classroom-membership check join-room already made.
    if (!inRoom(sharedRoom(liveSessionId))) {
      ack?.(false, undefined, "not joined to this session's room");
      return;
    }
    const room = audioRoom(liveSessionId);
    socket.join(room);

    // Peers already in the call each receive this and open an offer toward
    // the newcomer, who never offers back. That ordering is what keeps two
    // peers from offering simultaneously — no glare, no polite-peer dance.
    //
    // The joiner sees its own event too (broadcast, not socket.to), so the
    // client drops any peerId matching its own. It has to do that anyway to
    // survive a reconnect racing its own prior session.
    io.to(room).emit("audio-peer-joined", {
      peerId: socket.id,
      userId: appUser.id,
      name: displayName,
    });
    ack?.(true, socket.id);
  });

  socket.on("audio-signal", async (raw: unknown, ack?: Ack) => {
    const parsed = audioSignalSchema.safeParse(raw);
    if (!parsed.success) {
      ack?.(false, "invalid payload");
      return;
    }
    const { liveSessionId, toPeerId, signal } = parsed.data;
    const room = audioRoom(liveSessionId);
    if (!inRoom(room)) {
      ack?.(false, "not joined to this session's audio");
      return;
    }

    // Without this the toPeerId is an arbitrary socket id and the handler
    // becomes a way to push an SDP blob at any connected client on the
    // server. Adapter-backed, so it sees peers on other instances too.
    const members = await io.of("/").adapter.sockets(new Set([room]));
    if (!members.has(toPeerId)) {
      ack?.(false, "peer is not in this session's audio");
      return;
    }

    // Relayed opaquely — the server has no opinion about SDP or ICE.
    io.to(toPeerId).emit("audio-signal", { fromPeerId: socket.id, signal });
    ack?.(true);
  });

  socket.on("audio-leave", (raw: unknown, ack?: Ack) => {
    const parsed = audioLeaveSchema.safeParse(raw);
    if (!parsed.success) {
      ack?.(false, "invalid payload");
      return;
    }
    const room = audioRoom(parsed.data.liveSessionId);
    socket.leave(room);
    io.to(room).emit("audio-peer-left", { peerId: socket.id });
    ack?.(true);
  });

  // `disconnecting` rather than `disconnect`: socket.rooms is already empty by
  // the time `disconnect` fires, so a closed tab would leave a ghost
  // participant in everyone else's list forever.
  socket.on("disconnecting", () => {
    for (const room of socket.rooms) {
      if (room.endsWith(":audio")) {
        io.to(room).emit("audio-peer-left", { peerId: socket.id });
      }
    }
  });

  // ---------------------------------------------------------------------
  // Coach-only room. Nothing below may ever emit to sharedRoom() — the
  // reference board is the coach's prep material (CLAUDE.md §3.4).
  // ---------------------------------------------------------------------

  async function persistRefBoard(
    liveSessionId: string,
    fen: string,
    ack?: Ack
  ): Promise<boolean> {
    const coachId = await coachProfileId();
    if (!coachId) {
      ack?.(false, "no coach profile for this account");
      return false;
    }
    await runWithTenant(session.tenantId, () =>
      upsertReferenceBoardFen({
        tenantId: session.tenantId,
        liveSessionId,
        coachId,
        fen,
      })
    );
    await boardStore.setFen(liveSessionId, fen, "ref");
    return true;
  }

  socket.on("ref-board-load", async (raw: unknown, ack?: Ack) => {
    const parsed = refBoardLoadSchema.safeParse(raw);
    if (!parsed.success) {
      ack?.(false, "invalid payload");
      return;
    }
    const { liveSessionId, fen } = parsed.data;
    const room = coachRoom(liveSessionId);
    if (!inRoom(room)) {
      ack?.(false, "not joined to this session's coach room");
      return;
    }
    const game = safeLoadFen(fen);
    if (!game) {
      ack?.(false, "invalid FEN");
      return;
    }
    // Store chess.js's normalized form so a hand-typed FEN with odd spacing
    // doesn't break the compare-and-set on the next move.
    const normalized = game.fen();
    if (!(await persistRefBoard(liveSessionId, normalized, ack))) return;

    io.to(room).emit("ref-board-state", { fen: normalized });
    ack?.(true);
  });

  socket.on("ref-board-move", async (raw: unknown, ack?: Ack) => {
    const parsed = refBoardMoveSchema.safeParse(raw);
    if (!parsed.success) {
      ack?.(false, "invalid payload");
      return;
    }
    const { liveSessionId, from, to, promotion } = parsed.data;
    const room = coachRoom(liveSessionId);
    if (!inRoom(room)) {
      ack?.(false, "not joined to this session's coach room");
      return;
    }

    // Previously a blind relay. Now that the board is persisted there has to
    // be one authoritative position, so moves are validated like any other.
    // Arbitrary (non-reachable) setups go through ref-board-load instead.
    const currentFen = await boardStore.getFen(liveSessionId, "ref");
    const game = safeLoadFen(currentFen);
    if (!game) {
      ack?.(false, "board state unreadable");
      return;
    }
    const move = safeMove(game, { from, to, promotion });
    if (!move) {
      ack?.(false, "illegal move");
      return;
    }

    const nextFen = game.fen();
    const won = await boardStore.compareAndSetFen(
      liveSessionId,
      currentFen,
      nextFen,
      "ref"
    );
    if (!won) {
      const latest = await boardStore.getFen(liveSessionId, "ref");
      io.to(room).emit("ref-board-state", { fen: latest });
      ack?.(false, "position changed, resync");
      return;
    }
    if (!(await persistRefBoard(liveSessionId, nextFen, ack))) return;

    io.to(room).emit("ref-board-state", { fen: nextFen, lastMove: move });
    ack?.(true);
  });

  socket.on("ref-board-clear", async (raw: unknown, ack?: Ack) => {
    const parsed = refBoardClearSchema.safeParse(raw);
    if (!parsed.success) {
      ack?.(false, "invalid payload");
      return;
    }
    const { liveSessionId } = parsed.data;
    const room = coachRoom(liveSessionId);
    if (!inRoom(room)) {
      ack?.(false, "not joined to this session's coach room");
      return;
    }
    if (!(await persistRefBoard(liveSessionId, START_FEN, ack))) return;

    io.to(room).emit("ref-board-state", { fen: START_FEN });
    ack?.(true);
  });
}
