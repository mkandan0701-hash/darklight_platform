"use client";

import { useEffect, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { useRouter } from "next/navigation";
import { getStripeClientSecretAction } from "../actions";
import { Button } from "../../../../../components/ui/Button";

let stripePromise: Promise<Stripe | null> | undefined;
function getStripePromise() {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");
  }
  return stripePromise;
}

function CheckoutForm() {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // The webhook is what actually flips the invoice to PAID, asynchronously —
  // this poll just gives the payer feedback while that catches up, and it's
  // bounded so a slow webhook doesn't spin the UI forever.
  useEffect(() => {
    if (!confirming) return;
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      router.refresh();
      if (attempts >= 4) clearInterval(interval);
    }, 2000);
    return () => clearInterval(interval);
  }, [confirming, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (confirmError) {
      setError(confirmError.message ?? "Payment failed — please try again");
      setSubmitting(false);
      return;
    }

    setConfirming(true);
  }

  if (confirming) {
    return (
      <p className="text-sm text-ink">
        Payment received — confirming with your bank… this page will update automatically.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <Button type="submit" disabled={!stripe || submitting}>
        {submitting ? "Paying…" : "Pay now"}
      </Button>
      {error && <p className="text-sm text-brick">{error}</p>}
    </form>
  );
}

export function PayWithStripe({ invoiceId }: { invoiceId: string }) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getStripeClientSecretAction(invoiceId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setClientSecret(result.clientSecret);
    });
    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  if (error) return <p className="text-sm text-brick">{error}</p>;
  if (!clientSecret) return <p className="text-sm text-slate">Loading payment form…</p>;

  return (
    <Elements stripe={getStripePromise()} options={{ clientSecret }}>
      <CheckoutForm />
    </Elements>
  );
}
