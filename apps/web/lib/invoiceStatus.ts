import type { BadgeTone } from "../components/ui/Badge";

export function invoiceStatusTone(status: string): BadgeTone {
  switch (status) {
    case "PAID":
      return "success";
    case "FAILED":
      return "danger";
    case "REFUNDED":
      return "muted";
    default:
      return "neutral";
  }
}
