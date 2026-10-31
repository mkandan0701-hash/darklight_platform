import { Prisma, type WebhookProvider } from "@chessplay-clone/db";
import {
  findEvent,
  finishEvent,
  insertProcessingEvent,
  reclaimEvent,
} from "../repositories/webhookEventRepository";

// A delivery still marked PROCESSING after this long is treated as abandoned
// (the instance died mid-handler) and may be taken over by a retry.
export const STALE_PROCESSING_MS = 5 * 60_000;

export type HandlerOutcome = { status: "PROCESSED" | "IGNORED"; tenantId?: string | null };

export type LedgerResult =
  /** This delivery ran the handler. */
  | "processed"
  /** Already handled by an earlier delivery: acknowledge, do nothing. */
  | "duplicate"
  /** Another delivery is handling it right now: ask the provider to retry later. */
  | "in-progress";

/**
 * Runs `handle` at most once per (provider, event id) to completion.
 *
 * Claim first, then process: the claim row is inserted before any side effect,
 * so two simultaneous deliveries of one event can't both act on it. A handler
 * that throws marks the event FAILED and rethrows (the route answers 500 and
 * the provider retries, which reclaims it).
 */
export async function processWebhookOnce(
  provider: WebhookProvider,
  externalEventId: string,
  eventType: string,
  handle: () => Promise<HandlerOutcome>,
  now: () => Date = () => new Date()
): Promise<LedgerResult> {
  const key = { provider, externalEventId };

  let eventId: string;
  try {
    eventId = (await insertProcessingEvent(key, eventType)).id;
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") throw err;

    const existing = await findEvent(key);
    if (!existing) throw err; // vanished between the insert and the read: let the provider retry
    if (existing.status === "PROCESSED" || existing.status === "IGNORED") return "duplicate";

    const stale = now().getTime() - existing.receivedAt.getTime() > STALE_PROCESSING_MS;
    if (existing.status === "PROCESSING" && !stale) return "in-progress";
    if (!(await reclaimEvent(existing.id, existing))) return "in-progress";
    eventId = existing.id;
  }

  try {
    const outcome = await handle();
    await finishEvent(eventId, outcome);
    return "processed";
  } catch (err) {
    await finishEvent(eventId, { status: "FAILED", errorCode: errorCodeOf(err) }).catch(() => {
      // Leave it PROCESSING; it goes stale and the next retry reclaims it.
    });
    throw err;
  }
}

function errorCodeOf(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) return `prisma:${err.code}`;
  return err instanceof Error ? err.name : "unknown";
}
