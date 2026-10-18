import { Queue } from "bullmq";
import { withEnqueueTimeout } from "./enqueueTimeout";

// apps/web enqueues straight onto a BullMQ queue that apps/api consumes, for
// the same reason analysisQueue.ts does: there is no apps/web -> apps/api HTTP
// path anywhere, and claude.md §7 reserves REST for webhooks and external
// integrations. The queue name is the contract between the two processes.
//
// What is different here is the consumer. Analysis jobs are picked up by the
// separate worker process; these are picked up by the *API server* process,
// because re-emitting into a Socket.io room needs its `io` instance. See
// apps/api/src/socket/tournamentBroadcaster.ts.
//
// Lazily constructed so a missing or unreachable Redis fails at enqueue time
// rather than at module load (a page that 500s).
let queue: Queue | undefined;

export function tournamentEventsQueue(): Queue {
  if (!queue) {
    queue = new Queue("tournament-events", {
      connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" },
    });
  }
  return queue;
}

export type TournamentEventKind = "round-published" | "result-recorded";

export interface TournamentEvent {
  tenantId: string;
  tournamentId: string;
  kind: TournamentEventKind;
  round?: number;
}

export async function publishTournamentEvent(event: TournamentEvent): Promise<void> {
  // Bounded: an unreachable Redis makes add() hang rather than reject, and a
  // hung publish would leave the organiser's form spinning. See enqueueTimeout.
  await withEnqueueTimeout(
    "tournament-events",
    tournamentEventsQueue().add(
      "broadcast",
      // Stamped here rather than read off the job's own timestamp so the
      // consumer's staleness check measures time since the organiser acted,
      // not since the job was last retried.
      { ...event, publishedAt: Date.now() },
      {
        // A broadcast that failed is not worth retrying: by the time a retry
        // ran the consumer would discard it as stale anyway, and a viewer's
        // next action refetches regardless.
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: 100,
      }
    )
  );
}

/**
 * Publishes without ever failing the caller.
 *
 * The live push is a garnish on an action whose real work is already
 * committed — the pairings exist, the result is scored. Telling an organiser
 * "could not pair the round" because Redis is unreachable would be a lie that
 * costs them a round they cannot then generate again. Same shape as
 * awardXpSafely in gamificationRepository.
 */
export async function publishTournamentEventSafely(event: TournamentEvent): Promise<void> {
  try {
    await publishTournamentEvent(event);
  } catch (err) {
    console.error("Failed to publish tournament event", event, err);
  }
}
