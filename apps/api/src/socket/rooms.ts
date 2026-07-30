import { Chess } from "chess.js";
import type { Server, Socket } from "socket.io";
import { prisma, runWithTenant } from "@chessplay-clone/db";
import type { AuthedSession } from "@chessplay-clone/shared";

type AuthedSocket = Socket & { data: { session: AuthedSession } };

// In-memory authoritative board state per shared-session room. A dropped API
// instance loses in-flight game state — acceptable for the Wave 2 scaffold,
// but revisit once Socket.io moves behind the Redis adapter (see spec §3.4):
// this map will need to move to Redis at the same time so state is shared
// across instances, not just room broadcast.
const boards = new Map<string, Chess>();

function sharedRoom(roomId: string) {
  return `session:${roomId}`;
}
function coachRoom(roomId: string) {
  return `session:${roomId}:coach`;
}

async function canAccessLiveSession(
  session: AuthedSession,
  liveSessionId: string,
  wantsCoachRoom: boolean
): Promise<boolean> {
  const liveSession = await prisma.liveSession.findFirst({
    where: { id: liveSessionId, tenantId: session.tenantId },
    select: { classroomId: true },
  });
  if (!liveSession) return false;

  if (wantsCoachRoom) {
    if (session.role !== "COACH") return false;
    const membership = await prisma.classroomCoach.findFirst({
      where: {
        tenantId: session.tenantId,
        classroomId: liveSession.classroomId,
        coach: { userId: session.userId },
      },
    });
    return Boolean(membership);
  }

  if (session.role === "COACH") {
    const membership = await prisma.classroomCoach.findFirst({
      where: {
        tenantId: session.tenantId,
        classroomId: liveSession.classroomId,
        coach: { userId: session.userId },
      },
    });
    return Boolean(membership);
  }

  const membership = await prisma.classroomStudent.findFirst({
    where: {
      tenantId: session.tenantId,
      classroomId: liveSession.classroomId,
      student: { userId: session.userId },
    },
  });
  return Boolean(membership);
}

export function registerLiveSessionHandlers(io: Server, socket: AuthedSocket) {
  socket.on(
    "join-room",
    async (
      payload: { liveSessionId: string; room: "shared" | "coach" },
      ack?: (ok: boolean, error?: string) => void
    ) => {
      // Only handler here that touches Prisma today (via canAccessLiveSession) —
      // scope it to the socket's authenticated tenant so tenantScope's guard
      // verifies rather than merely trusts the tenantId in that query.
      await runWithTenant(socket.data.session.tenantId, async () => {
        const wantsCoachRoom = payload.room === "coach";
        const allowed = await canAccessLiveSession(
          socket.data.session,
          payload.liveSessionId,
          wantsCoachRoom
        );
        if (!allowed) {
          ack?.(false, "not authorized for this room");
          return;
        }
        const targetRoom = wantsCoachRoom
          ? coachRoom(payload.liveSessionId)
          : sharedRoom(payload.liveSessionId);
        socket.join(targetRoom);
        ack?.(true);
      });
    }
  );

  // Shared room: every move is re-validated server-side before broadcast.
  // Never trust or rebroadcast client-reported board state directly.
  // Doesn't touch Prisma today (board state is in-memory, see `boards`
  // above) — no runWithTenant wrap needed; add one if persistence is added.
  socket.on(
    "move",
    (
      payload: {
        liveSessionId: string;
        from: string;
        to: string;
        promotion?: string;
      },
      ack?: (ok: boolean, fen?: string, error?: string) => void
    ) => {
      const roomId = sharedRoom(payload.liveSessionId);
      if (!socket.rooms.has(roomId)) {
        ack?.(false, undefined, "not joined to this session's room");
        return;
      }

      let game = boards.get(payload.liveSessionId);
      if (!game) {
        game = new Chess();
        boards.set(payload.liveSessionId, game);
      }

      // chess.js v1 throws on an illegal move rather than returning null/undefined.
      let move: ReturnType<Chess["move"]>;
      try {
        move = game.move({
          from: payload.from,
          to: payload.to,
          promotion: payload.promotion,
        });
      } catch {
        ack?.(false, undefined, "illegal move");
        return;
      }

      const fen = game.fen();
      io.to(roomId).emit("game-state", { fen, lastMove: move });
      ack?.(true, fen);
    }
  );

  // Coach-only room: reference board events never leave `:coach`.
  socket.on(
    "ref-board-move",
    (
      payload: { liveSessionId: string; from: string; to: string; promotion?: string },
      ack?: (ok: boolean) => void
    ) => {
      const roomId = coachRoom(payload.liveSessionId);
      if (!socket.rooms.has(roomId)) {
        ack?.(false);
        return;
      }
      io.to(roomId).emit("ref-board-move", payload);
      ack?.(true);
    }
  );
}
