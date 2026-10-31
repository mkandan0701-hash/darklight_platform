import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { prisma, prismaBase, runWithTenant } from "@chessplay-clone/db";
import { processWebhookOnce, type HandlerOutcome } from "./ledger";

// Mounted with `express.raw({ type: "application/json" })` — Razorpay signs the
// exact raw request body with the webhook secret (HMAC-SHA256).
export const razorpayWebhookRouter = Router();

function isValidSignature(rawBody: Buffer, signature: string, secret: string) {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const signatureBuf = Buffer.from(signature, "utf8");
  return (
    expectedBuf.length === signatureBuf.length &&
    timingSafeEqual(expectedBuf, signatureBuf)
  );
}

// Same reasoning as the Stripe handler: Express 4 lets a rejected async handler
// escape to the process, so every throw below — including a malformed body that
// makes JSON.parse or the payload destructuring blow up — has to end as a 500.
razorpayWebhookRouter.post("/", async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    // HMAC keyed with "" is computable by anyone — an unset secret must
    // refuse, not verify against an empty key.
    if (!secret) {
      console.error("Razorpay webhook rejected: RAZORPAY_WEBHOOK_SECRET is not configured");
      return res.status(503).send("Webhook not configured");
    }
    if (
      !signature ||
      typeof signature !== "string" ||
      !isValidSignature(req.body, signature, secret)
    ) {
      return res.status(400).send("Invalid Razorpay signature");
    }

    const event = JSON.parse(req.body.toString("utf8"));

    // Razorpay sends the same x-razorpay-event-id on every retry of an event.
    // Without it, a retry is still byte-identical, so the signed body's hash
    // identifies the event just as well.
    const headerId = req.headers["x-razorpay-event-id"];
    const eventId =
      typeof headerId === "string" && headerId
        ? headerId
        : `sha256:${createHash("sha256").update(req.body).digest("hex")}`;

    const result = await processWebhookOnce("RAZORPAY", eventId, String(event.event), () =>
      handleEvent(event)
    );
    if (result === "in-progress") {
      return res.status(409).json({ error: "Event is already being processed" });
    }

    res.json({ received: true, duplicate: result === "duplicate" });
  } catch (error) {
    console.error("Razorpay webhook error:", error);
    // Never log the body — it carries customer and payment identifiers.
    if (!res.headersSent) {
      res.status(500).json({ error: "Webhook processing failed" });
    }
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Razorpay's payload is unverified JSON; only the fields read below are relied on.
async function handleEvent(event: any): Promise<HandlerOutcome> {
  switch (event.event) {
    case "payment.captured":
    case "payment.failed": {
      const payment = event.payload.payment.entity;

      // Never trust payment.notes?.tenantId as the scoping filter — it's
      // unverified webhook payload data. Resolve the invoice's real tenantId
      // from Postgres via its globally-unique (provider, providerRef) key
      // instead. Sanctioned prismaBase exception — see packages/db/src/index.ts.
      const invoice = await prismaBase.invoice.findUnique({
        where: { provider_providerRef: { provider: "RAZORPAY", providerRef: payment.order_id } },
        select: { tenantId: true },
      });
      if (!invoice) return { status: "IGNORED" }; // no matching invoice on file — nothing to update

      const status = event.event === "payment.captured" ? "PAID" : "FAILED";
      await runWithTenant(invoice.tenantId, () =>
        prisma.invoice.updateMany({
          where: {
            provider: "RAZORPAY",
            providerRef: payment.order_id,
            tenantId: invoice.tenantId,
          // A webhook may only move an invoice forward. Providers deliver
          // out of order and retry: a failed attempt reported after the
          // successful one must not turn PAID back into FAILED, and a repeat
          // "succeeded" must not overwrite the original paidAtUtc.
          status: { notIn: ["PAID", "REFUNDED"] },
          },
          data:
            status === "PAID"
              ? { status: "PAID", paidAtUtc: new Date() }
              : { status: "FAILED" },
        })
      );
      return { status: "PROCESSED", tenantId: invoice.tenantId };
    }
    default:
      return { status: "IGNORED" };
  }
}
