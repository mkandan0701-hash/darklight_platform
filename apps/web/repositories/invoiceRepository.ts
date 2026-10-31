import { prisma, type PaymentProvider } from "@chessplay-clone/db";
import { TenantMismatchError } from "../lib/auth/errors";

export async function createInvoice(input: {
  tenantId: string;
  studentId: string;
  amount: number;
  currency: string;
  provider: PaymentProvider;
  providerRef: string;
  dueAtUtc: Date;
  description: string;
  createdByUserId: string;
}) {
  // Same shape as assignCoach/enrollStudent: the row carries the caller's own
  // tenantId regardless of whose student this actually is, so only this check
  // catches a studentId borrowed from another academy.
  const student = await prisma.studentProfile.findFirst({
    where: { id: input.studentId, tenantId: input.tenantId },
    select: { id: true },
  });
  if (!student) {
    throw new TenantMismatchError("Student does not belong to this academy");
  }

  return prisma.invoice.create({ data: input });
}

export async function listInvoicesForTenant(tenantId: string) {
  return prisma.invoice.findMany({
    where: { tenantId },
    include: { student: { include: { user: true } } },
    orderBy: { dueAtUtc: "desc" },
  });
}

export async function listInvoicesForStudent(tenantId: string, studentId: string) {
  return prisma.invoice.findMany({
    where: { tenantId, studentId },
    orderBy: { dueAtUtc: "desc" },
  });
}

// Tenant-scoped only — for ACADEMY_ADMIN, who may view any invoice in the
// academy. Anything reachable by a STUDENT or PARENT must use
// getInvoiceForStudent instead, which adds the ownership/link check.
export async function getInvoiceForTenant(tenantId: string, invoiceId: string) {
  return prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId },
    include: { student: { include: { user: true } } },
  });
}

// Null for an invoice that isn't this student's, indistinguishable from one
// that doesn't exist — same contract as getClassroomForViewer.
export async function getInvoiceForStudent(
  tenantId: string,
  invoiceId: string,
  studentId: string
) {
  return prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId, studentId },
  });
}
