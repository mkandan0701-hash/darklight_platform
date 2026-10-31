import { prisma, type WebhookEventStatus, type WebhookProvider } from "@chessplay-clone/db";

// WebhookEvent is platform-level, outside tenantScope's model list, so these
// go through `prisma` unchecked by design. See the model's comment in
// schema.prisma for why it isn't tenant-scoped.

export type EventKey = { provider: WebhookProvider; externalEventId: string };

/** Inserts the claim row; throws Prisma P2002 when the event is already known. */
export async function insertProcessingEvent(key: EventKey, eventType: string) {
  return prisma.webhookEvent.create({
    data: { ...key, eventType, status: "PROCESSING" },
    select: { id: true },
  });
}

export async function findEvent(key: EventKey) {
  return prisma.webhookEvent.findUnique({
    where: { provider_externalEventId: key },
    select: { id: true, status: true, receivedAt: true },
  });
}

/**
 * Takes over an event that failed, or stalled mid-processing. Conditional on
 * the status and timestamp just read, so of two deliveries racing for the same
 * event exactly one gets count 1.
 */
export async function reclaimEvent(id: string, from: { status: WebhookEventStatus; receivedAt: Date }) {
  const { count } = await prisma.webhookEvent.updateMany({
    where: { id, status: from.status, receivedAt: from.receivedAt },
    data: { status: "PROCESSING", receivedAt: new Date(), attempts: { increment: 1 }, errorCode: null },
  });
  return count === 1;
}

export async function finishEvent(
  id: string,
  outcome: { status: "PROCESSED" | "IGNORED" | "FAILED"; tenantId?: string | null; errorCode?: string }
) {
  await prisma.webhookEvent.update({
    where: { id },
    data: {
      status: outcome.status,
      tenantId: outcome.tenantId ?? undefined,
      errorCode: outcome.errorCode ?? null,
      processedAt: new Date(),
    },
  });
}
