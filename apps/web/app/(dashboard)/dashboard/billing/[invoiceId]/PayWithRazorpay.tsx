"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { Button } from "../../../../../components/ui/Button";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export function PayWithRazorpay({
  orderId,
  amount,
  currency,
  keyId,
}: {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
}) {
  const router = useRouter();
  const [scriptReady, setScriptReady] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Same reasoning as PayWithStripe: the razorpay.ts webhook (signature
  // verified, untouched by this feature) is what actually flips the invoice
  // to PAID — this poll only gives the payer feedback while that catches up.
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

  function pay() {
    const razorpay = new window.Razorpay({
      key: keyId,
      order_id: orderId,
      amount,
      currency,
      name: "Tuition payment",
      // Razorpay's own success callback — cosmetic only. It must not write
      // invoice status itself; the signature-verified webhook is the only
      // source of truth for that.
      handler: () => setConfirming(true),
    });
    razorpay.open();
  }

  if (confirming) {
    return (
      <p className="text-sm text-ink">
        Payment received — confirming… this page will update automatically.
      </p>
    );
  }

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        onLoad={() => setScriptReady(true)}
      />
      <Button type="button" onClick={pay} disabled={!scriptReady}>
        {scriptReady ? "Pay now" : "Loading payment form…"}
      </Button>
      <p className="mt-2 text-xs text-slate">
        You&rsquo;ll be redirected to Razorpay&rsquo;s secure checkout.
      </p>
    </>
  );
}
