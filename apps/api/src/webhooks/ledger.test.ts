import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@chessplay-clone/db";
import { processWebhookOnce, STALE_PROCESSING_MS } from "./ledger";

const insertProcessingEvent = vi.fn();
const findEvent = vi.fn();
const reclaimEvent = vi.fn();
const finishEvent = vi.fn();
vi.mock("../repositories/webhookEventRepository", () => ({
  insertProcessingEvent: (...a: unknown[]) => insertProcessingEvent(...a),
  findEvent: (...a: unknown[]) => findEvent(...a),
  reclaimEvent: (...a: unknown[]) => reclaimEvent(...a),
  finishEvent: (...a: unknown[]) => finishEvent(...a),
}));

const NOW = new Date("2026-11-01T10:00:00Z");
const now = () => NOW;
const duplicateKey = () =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });

beforeEach(() => {
  vi.clearAllMocks();
  insertProcessingEvent.mockResolvedValue({ id: "we_1" });
  finishEvent.mockResolvedValue(undefined);
});

describe("processWebhookOnce", () => {
  it("runs a new event and records its outcome", async () => {
    const handle = vi.fn().mockResolvedValue({ status: "PROCESSED", tenantId: "t1" });

    await expect(processWebhookOnce("STRIPE", "evt_1", "payment_intent.succeeded", handle, now)).resolves.toBe(
      "processed"
    );
    expect(handle).toHaveBeenCalledOnce();
    expect(finishEvent).toHaveBeenCalledWith("we_1", { status: "PROCESSED", tenantId: "t1" });
  });

  it("acknowledges an already-processed event without running it again", async () => {
    insertProcessingEvent.mockRejectedValue(duplicateKey());
    findEvent.mockResolvedValue({ id: "we_1", status: "PROCESSED", receivedAt: NOW });
    const handle = vi.fn();

    await expect(processWebhookOnce("STRIPE", "evt_1", "x", handle, now)).resolves.toBe("duplicate");
    expect(handle).not.toHaveBeenCalled();
  });

  it("treats an ignored event as handled too", async () => {
    insertProcessingEvent.mockRejectedValue(duplicateKey());
    findEvent.mockResolvedValue({ id: "we_1", status: "IGNORED", receivedAt: NOW });

    await expect(processWebhookOnce("STRIPE", "evt_1", "x", vi.fn(), now)).resolves.toBe("duplicate");
  });

  it("reports a fresh in-flight delivery as in progress", async () => {
    insertProcessingEvent.mockRejectedValue(duplicateKey());
    findEvent.mockResolvedValue({ id: "we_1", status: "PROCESSING", receivedAt: new Date(NOW.getTime() - 1000) });
    const handle = vi.fn();

    await expect(processWebhookOnce("STRIPE", "evt_1", "x", handle, now)).resolves.toBe("in-progress");
    expect(handle).not.toHaveBeenCalled();
    expect(reclaimEvent).not.toHaveBeenCalled();
  });

  it("retries a failed event once it reclaims it", async () => {
    insertProcessingEvent.mockRejectedValue(duplicateKey());
    findEvent.mockResolvedValue({ id: "we_1", status: "FAILED", receivedAt: NOW });
    reclaimEvent.mockResolvedValue(true);
    const handle = vi.fn().mockResolvedValue({ status: "PROCESSED" });

    await expect(processWebhookOnce("STRIPE", "evt_1", "x", handle, now)).resolves.toBe("processed");
    expect(handle).toHaveBeenCalledOnce();
  });

  it("takes over a stale in-flight delivery", async () => {
    insertProcessingEvent.mockRejectedValue(duplicateKey());
    const receivedAt = new Date(NOW.getTime() - STALE_PROCESSING_MS - 1);
    findEvent.mockResolvedValue({ id: "we_1", status: "PROCESSING", receivedAt });
    reclaimEvent.mockResolvedValue(true);
    const handle = vi.fn().mockResolvedValue({ status: "PROCESSED" });

    await expect(processWebhookOnce("STRIPE", "evt_1", "x", handle, now)).resolves.toBe("processed");
    expect(reclaimEvent).toHaveBeenCalledWith("we_1", { id: "we_1", status: "PROCESSING", receivedAt });
  });

  it("lets only one of two racing retries reclaim a failed event", async () => {
    insertProcessingEvent.mockRejectedValue(duplicateKey());
    findEvent.mockResolvedValue({ id: "we_1", status: "FAILED", receivedAt: NOW });
    reclaimEvent.mockResolvedValue(false);
    const handle = vi.fn();

    await expect(processWebhookOnce("STRIPE", "evt_1", "x", handle, now)).resolves.toBe("in-progress");
    expect(handle).not.toHaveBeenCalled();
  });

  it("marks the event failed and rethrows when the handler throws", async () => {
    const boom = new TypeError("bad payload");
    const handle = vi.fn().mockRejectedValue(boom);

    await expect(processWebhookOnce("RAZORPAY", "evt_9", "x", handle, now)).rejects.toBe(boom);
    expect(finishEvent).toHaveBeenCalledWith("we_1", { status: "FAILED", errorCode: "TypeError" });
  });

  it("rethrows a database error that isn't a duplicate key", async () => {
    const down = new Error("connection refused");
    insertProcessingEvent.mockRejectedValue(down);

    await expect(processWebhookOnce("STRIPE", "evt_1", "x", vi.fn(), now)).rejects.toBe(down);
  });
});
