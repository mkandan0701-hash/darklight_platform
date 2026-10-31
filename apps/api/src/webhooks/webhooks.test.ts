import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import Stripe from "stripe";
import { stripeWebhookRouter } from "./stripe";
import { razorpayWebhookRouter } from "./razorpay";
import { whatsappWebhookRouter } from "./whatsapp";

// Regression tests for two payment-webhook defects:
//  1. An unset secret verified signatures against an empty HMAC key, which
//     anyone can compute — a forged "succeeded" event marked invoices PAID.
//  2. A late/retried failure event downgraded an already-PAID invoice.
// Real HTTP against each router, so the raw-body signature path is exercised.

const { findUnique, updateMany } = vi.hoisted(() => ({ findUnique: vi.fn(), updateMany: vi.fn() }));
vi.mock("@chessplay-clone/db", () => ({
  prismaBase: { invoice: { findUnique: (...a: unknown[]) => findUnique(...a) } },
  prisma: { invoice: { updateMany: (...a: unknown[]) => updateMany(...a) } },
  runWithTenant: (_t: string, fn: () => unknown) => fn(),
}));


let base = "";
let server: ReturnType<ReturnType<typeof express>["listen"]>;

beforeAll(async () => {
  const app = express();
  app.use("/stripe", express.raw({ type: "application/json" }), stripeWebhookRouter);
  app.use("/razorpay", express.raw({ type: "application/json" }), razorpayWebhookRouter);
  app.use("/whatsapp", express.raw({ type: "application/json" }), whatsappWebhookRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const saved = { ...process.env };
beforeEach(() => {
  findUnique.mockReset().mockResolvedValue({ tenantId: "t_1" });
  updateMany.mockReset().mockResolvedValue({ count: 1 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...saved };
  vi.restoreAllMocks();
});

const post = (path: string, body: string, headers: Record<string, string>) =>
  fetch(`${base}${path}`, { method: "POST", body, headers: { "content-type": "application/json", ...headers } });

const stripeBody = (type: string) => JSON.stringify({ id: "evt_1", object: "event", type, data: { object: { id: "pi_1" } } });
const stripeSig = (body: string, secret: string) =>
  new Stripe("sk_test_x").webhooks.generateTestHeaderString({ payload: body, secret });

describe("Stripe webhook", () => {
  it("refuses everything when STRIPE_WEBHOOK_SECRET is unset — even an empty-key signature", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const body = stripeBody("payment_intent.succeeded");
    const res = await post("/stripe", body, { "stripe-signature": stripeSig(body, "") });
    expect(res.status).toBe(503);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("rejects a signature made with the wrong secret", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_real";
    const body = stripeBody("payment_intent.succeeded");
    const res = await post("/stripe", body, { "stripe-signature": stripeSig(body, "whsec_guess") });
    expect(res.status).toBe(400);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("marks PAID on a valid event, but never touches an invoice already PAID or REFUNDED", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_real";
    const body = stripeBody("payment_intent.succeeded");
    const res = await post("/stripe", body, { "stripe-signature": stripeSig(body, "whsec_real") });
    expect(res.status).toBe(200);
    expect(updateMany.mock.calls[0][0]).toMatchObject({
      where: { provider: "STRIPE", providerRef: "pi_1", tenantId: "t_1", status: { notIn: ["PAID", "REFUNDED"] } },
      data: { status: "PAID" },
    });
  });

  it("a late failure event cannot downgrade a PAID invoice", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_real";
    const body = stripeBody("payment_intent.payment_failed");
    await post("/stripe", body, { "stripe-signature": stripeSig(body, "whsec_real") });
    expect(updateMany.mock.calls[0][0].where.status).toEqual({ notIn: ["PAID", "REFUNDED"] });
    expect(updateMany.mock.calls[0][0].data).toEqual({ status: "FAILED" });
  });
});

const razorpayBody = (event: string) =>
  JSON.stringify({ event, payload: { payment: { entity: { order_id: "order_1" } } } });
const hmac = (body: string, key: string) => createHmac("sha256", key).update(body).digest("hex");

describe("Razorpay webhook", () => {
  it("refuses when RAZORPAY_WEBHOOK_SECRET is unset — an empty-key HMAC is forgeable", async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const body = razorpayBody("payment.captured");
    const res = await post("/razorpay", body, { "x-razorpay-signature": hmac(body, "") });
    expect(res.status).toBe(503);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("accepts a correctly signed capture, guarded against downgrading", async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "rzp_real";
    const body = razorpayBody("payment.captured");
    const res = await post("/razorpay", body, { "x-razorpay-signature": hmac(body, "rzp_real") });
    expect(res.status).toBe(200);
    expect(updateMany.mock.calls[0][0].where).toMatchObject({
      providerRef: "order_1",
      status: { notIn: ["PAID", "REFUNDED"] },
    });
  });

  it("rejects a bad signature", async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "rzp_real";
    const body = razorpayBody("payment.captured");
    const res = await post("/razorpay", body, { "x-razorpay-signature": hmac(body, "nope") });
    expect(res.status).toBe(400);
  });
});

describe("WhatsApp webhook", () => {
  it("does not complete the verify handshake when no token is configured", async () => {
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    const res = await fetch(`${base}/whatsapp?hub.mode=subscribe&hub.challenge=hello`);
    expect(res.status).toBe(403);
  });

  it("completes it with the configured token", async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "tok";
    const res = await fetch(`${base}/whatsapp?hub.mode=subscribe&hub.verify_token=tok&hub.challenge=hello`);
    expect(await res.text()).toBe("hello");
  });

  it("refuses posts when WHATSAPP_APP_SECRET is unset", async () => {
    delete process.env.WHATSAPP_APP_SECRET;
    const body = "{}";
    const res = await post("/whatsapp", body, { "x-hub-signature-256": `sha256=${hmac(body, "")}` });
    expect(res.status).toBe(403);
  });
});
