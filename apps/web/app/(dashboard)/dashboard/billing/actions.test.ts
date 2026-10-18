import { beforeEach, describe, expect, it, vi } from "vitest";
import { TenantMismatchError } from "../../../../lib/auth/errors";

const getCurrentSession = vi.fn();
const createInvoice = vi.fn();
const getInvoiceForTenant = vi.fn();
const getInvoiceForStudent = vi.fn();
const getChildForParent = vi.fn();
const getStudentProfileByUserId = vi.fn();
const paymentIntentsCreate = vi.fn();
const paymentIntentsRetrieve = vi.fn();
const ordersCreate = vi.fn();

vi.mock("../../../../lib/auth/session", () => ({
  getCurrentSession: () => getCurrentSession(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../../../repositories/invoiceRepository", () => ({
  createInvoice: (...a: unknown[]) => createInvoice(...a),
  getInvoiceForTenant: (...a: unknown[]) => getInvoiceForTenant(...a),
  getInvoiceForStudent: (...a: unknown[]) => getInvoiceForStudent(...a),
}));
vi.mock("../../../../repositories/userRepository", () => ({
  getChildForParent: (...a: unknown[]) => getChildForParent(...a),
  getStudentProfileByUserId: (...a: unknown[]) => getStudentProfileByUserId(...a),
}));
vi.mock("../../../../lib/payments/stripeClient", () => ({
  createStripeClient: () => ({
    paymentIntents: {
      create: (...a: unknown[]) => paymentIntentsCreate(...a),
      retrieve: (...a: unknown[]) => paymentIntentsRetrieve(...a),
    },
  }),
}));
vi.mock("../../../../lib/payments/razorpayClient", () => ({
  createRazorpayClient: () => ({
    orders: { create: (...a: unknown[]) => ordersCreate(...a) },
  }),
}));

const { createInvoiceAction, getStripeClientSecretAction } = await import("./actions");

const sessionAs = (role: string) => ({
  id: "user_1",
  tenantId: "tenant_1",
  role,
  email: "a@x.test",
  timezone: "Asia/Kolkata",
});

function invoiceForm(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("studentId", "stu_1");
  fd.set("amountMajorUnits", "50");
  fd.set("currency", "USD");
  fd.set("dueLocalDate", "2026-02-01");
  fd.set("description", "February tuition");
  fd.set("idempotencyKey", "11111111-1111-1111-1111-111111111111");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  [
    getCurrentSession,
    createInvoice,
    getInvoiceForTenant,
    getInvoiceForStudent,
    getChildForParent,
    getStudentProfileByUserId,
    paymentIntentsCreate,
    paymentIntentsRetrieve,
    ordersCreate,
  ].forEach((m) => m.mockReset());

  getCurrentSession.mockResolvedValue(sessionAs("ACADEMY_ADMIN"));
  paymentIntentsCreate.mockResolvedValue({ id: "pi_123" });
  paymentIntentsRetrieve.mockResolvedValue({ client_secret: "secret_abc" });
  ordersCreate.mockResolvedValue({ id: "order_123" });
  createInvoice.mockResolvedValue({ id: "inv_1" });
});

describe("createInvoiceAction", () => {
  it("refuses anyone but an academy admin", async () => {
    for (const role of ["COACH", "STUDENT", "PARENT"]) {
      getCurrentSession.mockResolvedValue(sessionAs(role));
      const result = await createInvoiceAction(invoiceForm());
      expect(result).toEqual({ ok: false, error: "Only academy admins can create invoices" });
      expect(paymentIntentsCreate).not.toHaveBeenCalled();
      expect(createInvoice).not.toHaveBeenCalled();
    }
  });

  it("creates a Stripe PaymentIntent before writing the invoice, passing the idempotency key through", async () => {
    const result = await createInvoiceAction(invoiceForm());
    expect(result).toEqual({ ok: true });

    expect(paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5000, currency: "usd" }),
      { idempotencyKey: "11111111-1111-1111-1111-111111111111" }
    );
    expect(createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant_1",
        studentId: "stu_1",
        amount: 5000,
        currency: "USD",
        provider: "STRIPE",
        providerRef: "pi_123",
        createdByUserId: "user_1",
      })
    );

    // The provider call must be ordered before the DB write, not just both present.
    const createOrder = paymentIntentsCreate.mock.invocationCallOrder[0];
    const dbOrder = createInvoice.mock.invocationCallOrder[0];
    expect(createOrder).toBeLessThan(dbOrder);
  });

  it("routes INR to Razorpay instead of Stripe", async () => {
    await createInvoiceAction(invoiceForm({ currency: "INR" }));
    expect(ordersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5000, currency: "INR", receipt: expect.any(String) })
    );
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
    expect(createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "RAZORPAY", providerRef: "order_123" })
    );
  });

  it("never reaches the database write when the provider call fails", async () => {
    paymentIntentsCreate.mockRejectedValue(new Error("stripe is down"));
    const result = await createInvoiceAction(invoiceForm());
    expect(result).toEqual({
      ok: false,
      error: "Could not start the payment with the provider — please try again",
    });
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("refuses a student who isn't part of this academy", async () => {
    createInvoice.mockRejectedValue(new TenantMismatchError("nope"));
    const result = await createInvoiceAction(invoiceForm());
    expect(result).toEqual({ ok: false, error: "That student isn't part of your academy" });
  });
});

describe("getStripeClientSecretAction", () => {
  const stripeInvoice = { id: "inv_1", studentId: "stu_1", provider: "STRIPE", providerRef: "pi_123" };

  it("returns the client secret for the invoice's own student", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("STUDENT"));
    getStudentProfileByUserId.mockResolvedValue({ id: "stu_1" });
    getInvoiceForStudent.mockResolvedValue(stripeInvoice);

    const result = await getStripeClientSecretAction("inv_1");
    expect(result).toEqual({ ok: true, clientSecret: "secret_abc" });
  });

  it("refuses a student who isn't this invoice's own student", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("STUDENT"));
    getStudentProfileByUserId.mockResolvedValue({ id: "stu_1" });
    getInvoiceForStudent.mockResolvedValue(null);

    const result = await getStripeClientSecretAction("someone_elses_invoice");
    expect(result).toEqual({ ok: false, error: "Invoice not found" });
  });

  it("returns the secret for a parent linked to the invoice's student", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("PARENT"));
    getInvoiceForTenant.mockResolvedValue(stripeInvoice);
    getChildForParent.mockResolvedValue({ id: "stu_1" });

    const result = await getStripeClientSecretAction("inv_1");
    expect(result).toEqual({ ok: true, clientSecret: "secret_abc" });
  });

  it("refuses a parent not linked to the invoice's student", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("PARENT"));
    getInvoiceForTenant.mockResolvedValue(stripeInvoice);
    getChildForParent.mockResolvedValue(null);

    const result = await getStripeClientSecretAction("inv_1");
    expect(result).toEqual({ ok: false, error: "Invoice not found" });
  });

  it("lets an academy admin in the same tenant through", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("ACADEMY_ADMIN"));
    getInvoiceForTenant.mockResolvedValue(stripeInvoice);

    const result = await getStripeClientSecretAction("inv_1");
    expect(result).toEqual({ ok: true, clientSecret: "secret_abc" });
  });

  it("refuses an admin from another tenant (invoice not found under their tenant scope)", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("ACADEMY_ADMIN"));
    getInvoiceForTenant.mockResolvedValue(null);

    const result = await getStripeClientSecretAction("inv_1");
    expect(result).toEqual({ ok: false, error: "Invoice not found" });
  });
});
