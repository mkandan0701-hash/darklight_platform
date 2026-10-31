import type { Socket } from "socket.io";
import { runWithTenant } from "@chessplay-clone/db";
import { tournamentExistsForTenant } from "../repositories/tournamentRepository";
import type { SocketSessionData } from "./authenticate";
import { joinTournamentSchema, leaveTournamentSchema } from "./schemas";

type AuthedSocket = Socket & { data: SocketSessionData };
type Ack = (ok: boolean, ...rest: unknown[]) => void;

// Keyed on the tournament id, like every other room in this service
// (sharedRoom, simulBoardRoom). Tournament.socketRoomId exists in the schema
// but nothing reads it — introducing a second identifier here would mean the
// client had to carry one id for the URL and another for the socket.
export function tournamentRoom(tournamentId: string) {
  return `tournament:${tournamentId}`;
}

/**
 * The live tournament room: pairings and results as they are published.
 *
 * Watch-only. Unlike the lesson and simul rooms, nothing a client sends in here
 * mutates anything — results are recorded through the organiser's server
 * action, and this room only carries word that something changed. That is also
 * why the broadcast payload holds no names or scores: the page refetches them
 * through its own authorization, so membership of this room reveals nothing on
 * its own.
 */
export function registerTournamentHandlers(socket: AuthedSocket) {
  const { session } = socket.data;

  socket.on("join-tournament", async (raw: unknown, ack?: Ack) => {
    const parsed = joinTournamentSchema.safeParse(raw);
    if (!parsed.success) {
      ack?.(false, undefined, "invalid payload");
      return;
    }
    const { tournamentId } = parsed.data;

    // Scope the lookup to the socket's authenticated tenant so tenantScope
    // verifies the tenantId filter rather than trusting it.
    const allowed = await runWithTenant(session.tenantId, () =>
      tournamentExistsForTenant(session.tenantId, tournamentId)
    );
    if (!allowed) {
      ack?.(false, undefined, "not authorized for this tournament");
      return;
    }

    await socket.join(tournamentRoom(tournamentId));
    ack?.(true);
  });

  // Leaving needs no authorization check: you can only leave a room you are
  // in, and socket.leave on one you aren't is a no-op.
  socket.on("leave-tournament", (raw: unknown, ack?: Ack) => {
    const parsed = leaveTournamentSchema.safeParse(raw);
    if (!parsed.success) {
      ack?.(false, undefined, "invalid payload");
      return;
    }
    void socket.leave(tournamentRoom(parsed.data.tournamentId));
    ack?.(true);
  });
}
