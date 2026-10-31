import { UnrecoverableError } from "bullmq";
import type { z } from "zod";

/**
 * Parse a job's payload, or fail it for good.
 *
 * A malformed payload won't parse on a retry either, so it's thrown as
 * UnrecoverableError: BullMQ moves the job straight to failed (kept for
 * inspection) instead of burning its attempts.
 */
export function parseJob<S extends z.ZodTypeAny>(schema: S, data: unknown, queue: string): z.infer<S> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new UnrecoverableError(
      `[${queue}] invalid job payload: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`
    );
  }
  return parsed.data;
}
