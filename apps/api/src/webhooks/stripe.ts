import { Router } from "express";
import Stripe from "stripe";
import { prisma, prismaBase, runWithTenant } from "@chessplay-clone/db";

// Mounted with `express.raw({ type: "application/json" })` (see src/index.ts) —
// Stripe's signature check needs the exact raw body bytes, not the parsed JSON.
export const stripeWebhookRouter = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2024-06-20",
});

stripeWebhookRouter.post("/", async (req, res) => {
  const signature = req.headers["stripe-signature"];
  if (!signature || typeof signature !== "string") {
    return res.status(400).send("Missing Stripe signature");
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET ?? ""
    );
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed`);
  }

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
      if (!invoice) break; // no matching invoice on file — nothing to update

      const status = event.type === "payment_intent.succeeded" ? "PAID" : "FAILED";
      await runWithTenant(invoice.tenantId, () =>
        prisma.invoice.updateMany({
          where: { provider: "STRIPE", providerRef: intent.id, tenantId: invoice.tenantId },
          data:
            status === "PAID"
              ? { status: "PAID", paidAtUtc: new Date() }
              : { status: "FAILED" },
        })
      );
      break;
    }
    default:
      break;
  }

  res.json({ received: true });
});
