import Stripe from "stripe";

// Server-only Stripe client for invoice creation and PaymentIntent retrieval.
// Same apiVersion as apps/api/src/webhooks/stripe.ts, kept in sync
// deliberately — a version drift between the two would mean the object
// shapes returned here don't match what the webhook expects to see.
export function createStripeClient() {
  return new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
    apiVersion: "2024-06-20",
  });
}
