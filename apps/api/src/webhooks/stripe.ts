import { Router } from "express";
import Stripe from "stripe";
import { prisma, prismaBase, runWithTenant } from "@chessplay-clone/db";
import { processWebhookOnce, type HandlerOutcome } from "./ledger";

// Mounted with `express.raw({ type: "application/json" })` (see src/index.ts) —
// Stripe's signature check needs the exact raw body bytes, not the parsed JSON.
export const stripeWebhookRouter = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2024-06-20",
});

// Express 4 does not catch rejections from an async handler: an unhandled one
// takes down the process, which drops every live session on the instance. Any
// throw below has to end as a 500 here. Stripe retries a 500, so returning one
// is also the correct answer for a transient DB failure.
stripeWebhookRouter.post("/", async (req, res) => {
  try {
    const signature = req.headers["stripe-signature"];
    if (!signature || typeof signature !== "string") {
      return res.status(400).send("Missing Stripe signature");
    }

    // An unset secret is not "no check": stripe-node happily verifies an
    // HMAC keyed with "", which anyone can compute — so a forged
    // payment_intent.succeeded would mark an invoice PAID. Refuse instead.
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      console.error("Stripe webhook rejected: STRIPE_WEBHOOK_SECRET is not configured");
      return res.status(503).send("Webhook not configured");
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, signature, secret);
    } catch (err) {
      return res.status(400).send(`Webhook signature verification failed`);
    }

    const result = await processWebhookOnce("STRIPE", event.id, event.type, () => handleEvent(event));
    if (result === "in-progress") {
      // Another delivery of this event is mid-flight; a non-2xx makes Stripe
      // retry later, by which time it is a recognised duplicate.
      return res.status(409).json({ error: "Event is already being processed" });
    }

    res.json({ received: true, duplicate: result === "duplicate" });
  } catch (error) {
    console.error("Stripe webhook error:", error);
    // Never log the body — it carries customer and payment identifiers.
    if (!res.headersSent) {
      res.status(500).json({ error: "Webhook processing failed" });
    }
  }
});

async function handleEvent(event: Stripe.Event): Promise<HandlerOutcome> {
  switch (event.type) {
    case "payment_intent.succeeded":
    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;

      // Never trust intent.metadata.tenantId as the scoping filter — it's
      // unverified webhook payload data. Resolve the invoice's real tenantId
      // from Postgres via its globally-unique (provider, providerRef) key
      // instead. Sanctioned prismaBase exception — see packages/db/src/index.ts.
      const invoice = await prismaBase.invoice.findUnique({
        where: { provider_providerRef: { provider: "STRIPE", providerRef: intent.id } },
        select: { tenantId: true },
      });
      if (!invoice) return { status: "IGNORED" }; // no matching invoice on file — nothing to update

      const status = event.type === "payment_intent.succeeded" ? "PAID" : "FAILED";
      await runWithTenant(invoice.tenantId, () =>
        prisma.invoice.updateMany({
          where: {
            provider: "STRIPE",
            providerRef: intent.id,
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
