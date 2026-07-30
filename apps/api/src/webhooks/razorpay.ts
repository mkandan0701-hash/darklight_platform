import { createHmac, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { prisma, prismaBase, runWithTenant } from "@chessplay-clone/db";

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

razorpayWebhookRouter.post("/", async (req, res) => {
  const signature = req.headers["x-razorpay-signature"];
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
  if (
    !signature ||
    typeof signature !== "string" ||
    !isValidSignature(req.body, signature, secret)
  ) {
    return res.status(400).send("Invalid Razorpay signature");
  }

  const event = JSON.parse(req.body.toString("utf8"));

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
      if (!invoice) break; // no matching invoice on file — nothing to update

      const status = event.event === "payment.captured" ? "PAID" : "FAILED";
      await runWithTenant(invoice.tenantId, () =>
        prisma.invoice.updateMany({
          where: { provider: "RAZORPAY", providerRef: payment.order_id, tenantId: invoice.tenantId },
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
