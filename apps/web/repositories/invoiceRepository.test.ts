import { describe, expect, it, vi, beforeEach } from "vitest";

const studentFindFirst = vi.fn();
const invoiceCreate = vi.fn();
const invoiceFindMany = vi.fn();
const invoiceFindFirst = vi.fn();

vi.mock("@chessplay-clone/db", () => ({
  prisma: {
    studentProfile: { findFirst: (...a: unknown[]) => studentFindFirst(...a) },
    invoice: {
      create: (...a: unknown[]) => invoiceCreate(...a),
      findMany: (...a: unknown[]) => invoiceFindMany(...a),
      findFirst: (...a: unknown[]) => invoiceFindFirst(...a),
    },
  },
}));

const {
  createInvoice,
  listInvoicesForTenant,
  listInvoicesForStudent,
  getInvoiceForTenant,
  getInvoiceForStudent,
} = await import("./invoiceRepository");

const baseInput = {
  tenantId: "tenant_1",
  studentId: "stu_1",
  amount: 5000,
  currency: "USD",
  provider: "STRIPE" as const,
  providerRef: "pi_123",
  dueAtUtc: new Date("2026-02-01T00:00:00.000Z"),
  description: "February tuition",
  createdByUserId: "user_1",
};

beforeEach(() => {
  [studentFindFirst, invoiceCreate, invoiceFindMany, invoiceFindFirst].forEach((m) =>
    m.mockReset()
  );
  studentFindFirst.mockResolvedValue(null);
});

// Same bug class as assignCoach/enrollStudent: the invoice row carries the
// caller's own tenantId regardless of whose student this actually is.
describe("createInvoice", () => {
  it("refuses a student from another academy", async () => {
    studentFindFirst.mockResolvedValue(null);
    await expect(createInvoice(baseInput)).rejects.toThrow(/does not belong to this academy/);
    expect(invoiceCreate).not.toHaveBeenCalled();
  });

  it("writes when the student belongs to the caller's tenant", async () => {
    studentFindFirst.mockResolvedValue({ id: "stu_1" });
    await createInvoice(baseInput);
    expect(invoiceCreate).toHaveBeenCalledWith({ data: baseInput });
  });

  it("scopes the student lookup to the caller's tenant", async () => {
    studentFindFirst.mockResolvedValue({ id: "stu_1" });
    await createInvoice(baseInput);
    expect(studentFindFirst.mock.calls[0][0].where).toEqual({
      id: "stu_1",
      tenantId: "tenant_1",
    });
  });
});

describe("listInvoicesForTenant", () => {
  it("scopes by tenant only, ordered by due date", async () => {
    await listInvoicesForTenant("tenant_1");
    expect(invoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant_1" },
        orderBy: { dueAtUtc: "desc" },
      })
    );
  });
});

describe("listInvoicesForStudent", () => {
  it("scopes by tenant and student", async () => {
    await listInvoicesForStudent("tenant_1", "stu_1");
    expect(invoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant_1", studentId: "stu_1" },
      })
    );
  });
});

describe("getInvoiceForTenant", () => {
  it("scopes by tenant only (admin access)", async () => {
    await getInvoiceForTenant("tenant_1", "inv_1");
    expect(invoiceFindFirst.mock.calls[0][0].where).toEqual({
      id: "inv_1",
      tenantId: "tenant_1",
    });
  });
});

describe("getInvoiceForStudent", () => {
  it("scopes by tenant and the specific student, not just tenant", async () => {
    await getInvoiceForStudent("tenant_1", "inv_1", "stu_1");
    expect(invoiceFindFirst.mock.calls[0][0].where).toEqual({
      id: "inv_1",
      tenantId: "tenant_1",
      studentId: "stu_1",
    });
  });
});
