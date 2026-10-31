import { Worker, type Job } from "bullmq";
import { z } from "zod";
import { createBullConnection } from "../redis";
import { tournamentRoom } from "./tournamentRooms";

// The web app can't emit into this process's Socket.io directly, so it enqueues
// here and the socket server re-emits. Same contract as apps/web's analysis
// queue: the queue *name* is the interface between the two processes, because
// CLAUDE.md §7 reserves REST for webhooks and there is no apps/web -> apps/api
// HTTP path.
//
// Consumed here, in the API server, rather than in the worker process — the
// broadcast needs the `io` instance, which only lives here. The work itself is
// a single room emit, so it doesn't compete with request handling the way the
// jobs in worker.ts would.
export const TOURNAMENT_EVENTS_QUEUE = "tournament-events";

/**
 * How late a push may be delivered and still be worth sending.
 *
 * A durable queue is the wrong shape for ephemeral fan-out, and this is the
 * seam. If every API instance is down while an organiser records five results,
 * those jobs sit in Redis and land the moment one comes back — telling viewers
 * "something just changed" about a round that finished an hour ago, and
 * kicking off a pointless refetch storm. Sixty seconds is longer than a deploy
 * blip and far shorter than a round.
 */
export const MAX_EVENT_AGE_MS = 60_000;

const tournamentEventSchema = z.object({
  tenantId: z.string().min(1),
  tournamentId: z.string().min(1),
  kind: z.enum(["round-published", "result-recorded"]),
  round: z.number().int().positive().optional(),
  publishedAt: z.number().int().positive(),
});

export type TournamentEventJobData = z.infer<typeof tournamentEventSchema>;

/** The slice of Socket.io's Server this needs — so tests can hand it a double. */
export type RoomEmitter = {
  to(room: string): { emit(event: string, ...args: unknown[]): unknown };
};

export type BroadcastOutcome =
  | { emitted: true; room: string }
  | { emitted: false; reason: "invalid payload" | "stale" };

/**
 * Re-emits one queued event into its tournament room.
 *
 * The payload deliberately carries no pairings, names or scores. Clients treat
 * it as a nudge and refetch the page through their own authorization, which
 * keeps the tenant-scoped read path in exactly one place (apps/web) instead of
 * duplicating it in this service.
 */
export function broadcastTournamentEvent(
  io: RoomEmitter,
  raw: unknown,
  now: number = Date.now()
): BroadcastOutcome {
  const parsed = tournamentEventSchema.safeParse(raw);
  if (!parsed.success) {
    return { emitted: false, reason: "invalid payload" };
  }

  const { tournamentId, kind, round, publishedAt } = parsed.data;
  if (now - publishedAt > MAX_EVENT_AGE_MS) {
    return { emitted: false, reason: "stale" };
  }

  const room = tournamentRoom(tournamentId);
  io.to(room).emit("tournament-updated", { tournamentId, kind, round });
  return { emitted: true, room };
}

export function startTournamentBroadcaster(io: RoomEmitter): Worker {
  return new Worker(
    TOURNAMENT_EVENTS_QUEUE,
    async (job: Job) => broadcastTournamentEvent(io, job.data),
    { connection: createBullConnection() }
  );
}
