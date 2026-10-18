import type { Server, Socket } from "socket.io";
import { runWithTenant } from "@chessplay-clone/db";
import type { AuthedSession } from "@chessplay-clone/shared";
import { findCoachProfileId } from "../repositories/liveSessionRepository";
import { findSimulBoard, findStudentProfileId } from "../repositories/simulRepository";
import { START_FEN, type BoardStore } from "./boardStore";
import { safeLoadFen, safeMove } from "./chess";
import type { SocketSessionData } from "./authenticate";
import { joinSimulBoardSchema, simulMoveSchema } from "./schemas";

type AuthedSocket = Socket & { data: SocketSessionData };
type Ack = (ok: boolean, ...rest: unknown[]) => void;

export type SimulDeps = { boardStore: BoardStore };

// One room per board, per CLAUDE.md §5: the coach is in all of them at once,
// each student in exactly one. Keyed by board index rather than board id so
// the room name is readable in logs, and stable if a board is re-created.
export function simulBoardRoom(simulId: string, boardIdx: number) {
  return `simul:${simulId}:${boardIdx}`;
}

/**
 * Who may sit at this board.
 *
 * The exhibition's coach plays every board; a student plays only their own.
 * Anyone else — another student in the same simul, a parent, an admin — is
 * refused: this is a live game, not a spectator feed, and a third party with
 * the room open could otherwise move a piece.
 */
async function canAccessSimulBoard(
  session: AuthedSession,
  appUserId: string,
  simulBoardId: string
): Promise<{ boardIdx: number; simulId: string; color: "w" | "b" } | null> {
  const board = await findSimulBoard(session.tenantId, simulBoardId);
  if (!board) return null;

  if (session.role === "COACH") {
    const coachProfileId = await findCoachProfileId(session.tenantId, appUserId);
    // Being a coach in this academy is not enough — it must be *this* simul's
    // coach, or one coach could play another's exhibition.
    if (!coachProfileId || coachProfileId !== board.coachId) return null;
    // The exhibitor takes White on every board, as in an over-the-board simul.
    return { boardIdx: board.boardIdx, simulId: board.simulId, color: "w" };
  }

  if (session.role === "STUDENT") {
    const studentProfileId = await findStudentProfileId(session.tenantId, appUserId);
    if (!studentProfileId || studentProfileId !== board.studentId) return null;
    return { boardIdx: board.boardIdx, simulId: board.simulId, color: "b" };
  }

  return null;
}

export function registerSimulHandlers(
  io: Server,
  socket: AuthedSocket,
  deps: SimulDeps
) {
  const { boardStore } = deps;
  const { session, appUser } = socket.data;

  /** True only if this socket previously passed the join authorization check. */
  function inRoom(room: string): boolean {
    return socket.rooms.has(room);
  }

  socket.on("join-simul-board", async (raw: unknown, ack?: Ack) => {
    const parsed = joinSimulBoardSchema.safeParse(raw);
    if (!parsed.success) {
      ack?.(false, undefined, "invalid payload");
      return;
    }
    const { simulBoardId } = parsed.data;

    const access = await runWithTenant(session.tenantId, () =>
      canAccessSimulBoard(session, appUser.id, simulBoardId)
    );
    if (!access) {
      ack?.(false, undefined, "not authorized for this board");
      return;
    }

    const room = simulBoardRoom(access.simulId, access.boardIdx);
    await socket.join(room);

    // Redis, not process memory: the coach and the student may be connected
    // to different API instances (CLAUDE.md §5).
    const fen = (await boardStore.getFen(simulBoardId, "simul")) ?? START_FEN;
    ack?.(true, { fen, color: access.color, boardIdx: access.boardIdx });
  });

  socket.on("simul-move", async (raw: unknown, ack?: Ack) => {
    const parsed = simulMoveSchema.safeParse(raw);
    if (!parsed.success) {
      ack?.(false, undefined, "invalid payload");
      return;
    }
    const { simulBoardId, from, to, promotion } = parsed.data;

    const access = await runWithTenant(session.tenantId, () =>
      canAccessSimulBoard(session, appUser.id, simulBoardId)
    );
    if (!access) {
      ack?.(false, undefined, "not authorized for this board");
      return;
    }

    const room = simulBoardRoom(access.simulId, access.boardIdx);
    if (!inRoom(room)) {
      ack?.(false, undefined, "not joined to this board");
      return;
    }

    const currentFen = (await boardStore.getFen(simulBoardId, "simul")) ?? START_FEN;
    const game = safeLoadFen(currentFen);
    if (!game) {
      ack?.(false, undefined, "board state unreadable");
      return;
    }

    // Whose turn it is decides who may move, so a player cannot move for
    // their opponent by sending a move while it is not their turn.
    if (game.turn() !== access.color) {
      ack?.(false, currentFen, "not your turn");
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
      simulBoardId,
      currentFen,
      nextFen,
      "simul"
    );
    if (!won) {
      const latest = await boardStore.getFen(simulBoardId, "simul");
      ack?.(false, latest, "position changed, resync");
      return;
    }

    io.to(room).emit("simul-board-state", { simulBoardId, fen: nextFen, lastMove: move });
    ack?.(true, nextFen);
  });
}
