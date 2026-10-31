import { z } from "zod";

// The contract between whoever enqueues a BullMQ job and the worker that runs
// it. Workers parse with these rather than casting `job.data`: a job is input
// like any other — it may be stale (queued by an older deploy) or malformed,
// and a tenantId in it is a claim the worker checks against Postgres, never
// an authority on its own.

export const gameAnalysisJobSchema = z.object({
  tenantId: z.string().min(1),
  gameId: z.string().min(1),
  depth: z.number().int().min(1).max(30).optional(),
});
export type GameAnalysisJobData = z.infer<typeof gameAnalysisJobSchema>;

// No handle: the worker reads it from the student's own row, so a job can't
// point one student's sync at somebody else's account. Jobs queued before
// this change still carry one; it is stripped, not trusted.
export const studentSyncJobSchema = z.object({
  tenantId: z.string().min(1),
  studentId: z.string().min(1),
});
export type StudentSyncJobData = z.infer<typeof studentSyncJobSchema>;

export const puzzleImportJobSchema = z.object({
  ratingMin: z.number().int().nonnegative().optional(),
  ratingMax: z.number().int().positive().optional(),
  maxCount: z.number().int().positive().optional(),
});
export type PuzzleImportJobData = z.infer<typeof puzzleImportJobSchema>;

/**
 * Retry policy for every queue. Three attempts with exponential backoff from
 * 30s rides out a provider 500 or a Redis/Postgres blip without hammering
 * either. Failed jobs are kept (bounded) so they can be inspected and retried.
 * A job that can never succeed throws BullMQ's UnrecoverableError and skips
 * the retries.
 */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 30_000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
} as const;
