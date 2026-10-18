"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { PaymentProvider } from "@chessplay-clone/db";
import { getCurrentSession } from "../../../../lib/auth/session";
import { requireRole } from "../../../../lib/auth/requireRole";
import { TenantMismatchError } from "../../../../lib/auth/errors";
import { zonedLocalToUtc } from "../../../../lib/time";
import { createStripeClient } from "../../../../lib/payments/stripeClient";
import { createRazorpayClient } from "../../../../lib/payments/razorpayClient";
import {
  createInvoice,
  getInvoiceForStudent,
  getInvoiceForTenant,
} from "../../../../repositories/invoiceRepository";
import { getChildForParent, getStudentProfileByUserId } from "../../../../repositories/userRepository";

type ActionResult = { ok: true } | { ok: false; error: string };

const CreateInvoiceSchema = z.object({
  studentId: z.string().min(1),
  amountMajorUnits: z.coerce.number().positive(),
  currency: z.enum(["USD", "INR"]),
  // A plain date input — the day is due end-of-day in the admin's own zone.
  dueLocalDate: z.string().min(1),
  description: z.string().min(1).max(200),
  // Generated once per form mount on the client and resubmitted verbatim on
  // every attempt while pending, so a double-click never mints two Stripe
  // PaymentIntents for the same invoice (Razorpay does not enforce this the
  // same way — see the comment at its call site below).
  idempotencyKey: z.string().uuid(),
});

export async function createInvoiceAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["ACADEMY_ADMIN"]);
  } catch {
    return { ok: false, error: "Only academy admins can create invoices" };
  }

  const parsed = CreateInvoiceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let dueAtUtc: Date;
  try {
    dueAtUtc = zonedLocalToUtc(`${parsed.data.dueLocalDate}T23:59`, session.timezone);
  } catch {
    return { ok: false, error: "Invalid due date" };
  }

  const amount = Math.round(parsed.data.amountMajorUnits * 100);
  const provider: PaymentProvider = parsed.data.currency === "USD" ? "STRIPE" : "RAZORPAY";

  // Create the provider-side object *before* touching Postgres. If this call
  // fails, nothing was written and the admin just retries. If the DB write
  // below fails after this succeeds, the PaymentIntent/Order is orphaned but
  // inert — no money moves without a matching Invoice row for the webhook to
  // update. The reverse order risks a PENDING invoice nobody can ever pay.
  let providerRef: string;
  try {
    if (provider === "STRIPE") {
      const intent = await createStripeClient().paymentIntents.create(
        {
          amount,
          currency: "usd",
          automatic_payment_methods: { enabled: true },
          description: parsed.data.description,
        },
        { idempotencyKey: parsed.data.idempotencyKey }
      );
      providerRef = intent.id;
    } else {
      // Razorpay's Orders API has no enforced idempotency key — `receipt` is
      // informational only, unlike Stripe's idempotencyKey above. A double
      // submit while pending is guarded client-side (disable-on-pending in
      // CreateInvoiceForm), not by the API itself.
      const order = await createRazorpayClient().orders.create({
        amount,
        currency: "INR",
        receipt: parsed.data.idempotencyKey,
      });
      providerRef = order.id;
    }
  } catch {
    return { ok: false, error: "Could not start the payment with the provider — please try again" };
  }

  try {
    await createInvoice({
      tenantId: session.tenantId,
      studentId: parsed.data.studentId,
      amount,
      currency: parsed.data.currency,
      provider,
      providerRef,
      dueAtUtc,
      description: parsed.data.description,
      createdByUserId: session.id,
    });
  } catch (err) {
    if (err instanceof TenantMismatchError) {
      return { ok: false, error: "That student isn't part of your academy" };
    }
    throw err;
  }

  revalidatePath("/dashboard/billing");
  return { ok: true };
}

/**
 * The one access check every pay-facing action re-verifies for itself,
 * rather than trusting the page that rendered the button: a server action is
 * independently callable with any invoiceId, so "the page already checked"
 * is not a guarantee about the request that actually reaches this function.
 */
export async function invoiceForPayer(
  session: { tenantId: string; id: string; role: string },
  invoiceId: string
) {
  if (session.role === "ACADEMY_ADMIN") {
    return getInvoiceForTenant(session.tenantId, invoiceId);
  }
  if (session.role === "STUDENT") {
    const student = await getStudentProfileByUserId(session.tenantId, session.id);
    if (!student) return null;
    return getInvoiceForStudent(session.tenantId, invoiceId, student.id);
  }
  if (session.role === "PARENT") {
    // getInvoiceForTenant first to learn whose invoice this is, then verify
    // the caller is actually linked to that student — same two-step
    // getChildForParent already requires everywhere else a parent reaches a
    // specific student's data.
    const invoice = await getInvoiceForTenant(session.tenantId, invoiceId);
    if (!invoice) return null;
    const child = await getChildForParent(session, invoice.studentId);
    return child ? invoice : null;
  }
  return null;
}

export async function getStripeClientSecretAction(
  invoiceId: string
): Promise<{ ok: true; clientSecret: string } | { ok: false; error: string }> {
  const session = await getCurrentSession();
  const invoice = await invoiceForPayer(session, invoiceId);
  if (!invoice || invoice.provider !== "STRIPE") {
    return { ok: false, error: "Invoice not found" };
  }

  const intent = await createStripeClient().paymentIntents.retrieve(invoice.providerRef);
  if (!intent.client_secret) {
    return { ok: false, error: "Payment could not be started" };
  }
  return { ok: true, clientSecret: intent.client_secret };
}
