// Invoice.amount is stored in the smallest unit of Invoice.currency (cents
// for USD, paise for INR) per claude.md §3.6 — this is the one place that
// divides back out for display, so every invoice view formats identically.
export function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
}
