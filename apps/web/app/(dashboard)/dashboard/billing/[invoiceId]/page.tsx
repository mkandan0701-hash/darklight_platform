import { notFound } from "next/navigation";
import { getCurrentSession } from "../../../../../lib/auth/session";
import { invoiceForPayer } from "../actions";
import { formatInZone } from "../../../../../lib/time";
import { formatAmount } from "../../../../../lib/money";
import { invoiceStatusTone } from "../../../../../lib/invoiceStatus";
import { PayWithStripe } from "./PayWithStripe";
import { PayWithRazorpay } from "./PayWithRazorpay";
import { Card } from "../../../../../components/ui/Card";
import { Badge } from "../../../../../components/ui/Badge";
import { pageHeadingClass } from "../../../../../components/ui/styles";

export default async function InvoiceDetailPage({
  params,
}: {
  params: { invoiceId: string };
}) {
  const session = await getCurrentSession();
  // Null for an invoice that isn't this viewer's — indistinguishable from one
  // that doesn't exist, same contract as getClassroomForViewer.
  const invoice = await invoiceForPayer(session, params.invoiceId);
  if (!invoice) notFound();

  return (
    <div>
      <h1 className={pageHeadingClass}>{invoice.description ?? "Invoice"}</h1>

      <Card className="mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="font-display text-2xl font-bold text-ink">
            {formatAmount(invoice.amount, invoice.currency)}
          </p>
          <p className="text-xs text-slate">
            Due {formatInZone(invoice.dueAtUtc, session.timezone)}
          </p>
        </div>
        <Badge tone={invoiceStatusTone(invoice.status)}>{invoice.status}</Badge>
      </Card>

      {invoice.status === "PENDING" && (
        <div className="mt-6">
          {invoice.provider === "STRIPE" ? (
            <PayWithStripe invoiceId={invoice.id} />
          ) : (
            <PayWithRazorpay
              orderId={invoice.providerRef}
              amount={invoice.amount}
              currency={invoice.currency}
              // key_id (unlike key_secret) is meant to be embedded in
              // client-side checkout code — Razorpay's own docs do this —
              // so a server-rendered prop is fine; it doesn't need a second
              // NEXT_PUBLIC_ env var.
              keyId={process.env.RAZORPAY_KEY_ID ?? ""}
            />
          )}
        </div>
      )}
    </div>
  );
}
