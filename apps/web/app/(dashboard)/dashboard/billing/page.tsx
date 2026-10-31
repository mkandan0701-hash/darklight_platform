import Link from "next/link";
import { getCurrentSession } from "../../../../lib/auth/session";
import { requireRole } from "../../../../lib/auth/requireRole";
import { formatInZone } from "../../../../lib/time";
import {
  listParentsAndStudents,
  getStudentProfileByUserId,
} from "../../../../repositories/userRepository";
import {
  listInvoicesForTenant,
  listInvoicesForStudent,
} from "../../../../repositories/invoiceRepository";
import { displayName } from "../../../../lib/displayName";
import { formatAmount } from "../../../../lib/money";
import { invoiceStatusTone } from "../../../../lib/invoiceStatus";
import { CreateInvoiceForm } from "./CreateInvoiceForm";
import { Card } from "../../../../components/ui/Card";
import { Badge } from "../../../../components/ui/Badge";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { pageHeadingClass, textLinkClass } from "../../../../components/ui/styles";

export default async function BillingPage() {
  const session = await getCurrentSession();

  if (session.role === "STUDENT") {
    const student = await getStudentProfileByUserId(session.tenantId, session.id);
    const invoices = student ? await listInvoicesForStudent(session.tenantId, student.id) : [];

    return (
      <div>
        <h1 className={pageHeadingClass}>Billing</h1>
        {invoices.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="No invoices yet"
              description="Tuition invoices from your academy will show up here."
            />
          </div>
        ) : (
          <ul className="mt-6 space-y-2">
            {invoices.map((invoice) => (
              <Card key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <Link href={`/dashboard/billing/${invoice.id}`} className={textLinkClass}>
                  {invoice.description ?? "Invoice"}
                </Link>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-slate">
                    {formatAmount(invoice.amount, invoice.currency)} · due{" "}
                    {formatInZone(invoice.dueAtUtc, session.timezone)}
                  </span>
                  <Badge tone={invoiceStatusTone(invoice.status)}>{invoice.status}</Badge>
                </div>
              </Card>
            ))}
          </ul>
        )}
      </div>
    );
  }

  try {
    requireRole(session, ["ACADEMY_ADMIN"]);
  } catch {
    // COACH and PARENT have no tenant-wide billing view — a parent's billing
    // is per-child, on that child's page, same split as homework.
    return (
      <div>
        <h1 className={pageHeadingClass}>Billing</h1>
        <div className="mt-6">
          <EmptyState
            title="Billing is shown per child"
            description="Open a child from your dashboard to see and pay their invoices."
            action={
              <Link href="/dashboard" className={textLinkClass}>
                Go to your children
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const [invoices, { students }] = await Promise.all([
    listInvoicesForTenant(session.tenantId),
    listParentsAndStudents(session.tenantId),
  ]);

  return (
    <div>
      <h1 className={pageHeadingClass}>Billing</h1>

      <div className="mt-4">
        <CreateInvoiceForm
          students={students.map((s) => ({ id: s.id, label: displayName(s.user) }))}
        />
      </div>

      {invoices.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No invoices yet"
            description="Create the first tuition invoice above."
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {invoices.map((invoice) => (
            <Card key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <Link href={`/dashboard/billing/${invoice.id}`} className={textLinkClass}>
                  {invoice.description ?? "Invoice"}
                </Link>
                <p className="text-xs text-slate">{displayName(invoice.student.user)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-slate">
                  {formatAmount(invoice.amount, invoice.currency)} · due{" "}
                  {formatInZone(invoice.dueAtUtc, session.timezone)}
                </span>
                <Badge tone={invoiceStatusTone(invoice.status)}>{invoice.status}</Badge>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
