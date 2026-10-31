import { Queue } from "bullmq";
import { DEFAULT_JOB_OPTIONS, gameAnalysisJobSchema } from "@chessplay-clone/shared";
import { withEnqueueTimeout } from "./enqueueTimeout";

// apps/web enqueues straight onto the same BullMQ queue apps/api's worker
// consumes, rather than calling the API over HTTP.
//
// That matches how this app is already built: apps/web talks to Postgres
// directly through @chessplay-clone/db and there is no apps/web -> apps/api
// HTTP path anywhere. The queue name is the contract between the two, exactly
// as a table name is for the database. Adding a REST endpoint for this would
// also cut against claude.md §7, which reserves REST for webhooks and
// external integrations.
//
// Lazily constructed so a missing or unreachable Redis fails at enqueue time
// (a message the coach sees) rather than at module load (a page that 500s).
let queue: Queue | undefined;

export function gameAnalysisQueue(): Queue {
  if (!queue) {
    queue = new Queue("game-analysis", {
      connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" },
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }
  return queue;
}

export async function enqueueGameAnalysis(input: {
  tenantId: string;
  gameId: string;
}): Promise<void> {
  // Bounded for the reason enqueueTimeout explains: an unreachable Redis makes
  // add() hang rather than reject, which would leave the coach's Request
  // analysis button spinning until the request itself timed out.
  await withEnqueueTimeout(
    "game-analysis",
    // Parsed with the worker's own schema, so a bad payload fails here, in
    // front of the coach, not later in the worker.
    gameAnalysisQueue().add("analyze", gameAnalysisJobSchema.parse(input), {
      // One in-flight analysis per game: a coach clicking twice, or two
      // coaches clicking at once, must not run Stockfish over the same game
      // twice.
      jobId: `analysis:${input.gameId}`,
      removeOnComplete: true,
      removeOnFail: 100,
    })
  );
}
