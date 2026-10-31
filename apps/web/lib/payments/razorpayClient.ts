import Razorpay from "razorpay";

// Server-only Razorpay client for invoice creation (Orders API). The
// razorpay.ts webhook (apps/api) only verifies an HMAC signature and never
// needs this SDK, so it stays out of apps/api's dependencies.
export function createRazorpayClient() {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID ?? "",
    key_secret: process.env.RAZORPAY_KEY_SECRET ?? "",
  });
}
