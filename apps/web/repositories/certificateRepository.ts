import { prisma, type CertificateType } from "@chessplay-clone/db";
import { TenantMismatchError } from "../lib/auth/errors";

export async function createCertificate(input: {
  tenantId: string;
  studentId: string;
  type: CertificateType;
  pdfUrl: string;
  issuedByUserId: string;
  eventName?: string;
  eventResult?: string;
  eventDateUtc?: Date;
}) {
  // Same cross-tenant guard as createInvoice/recordRating.
  const student = await prisma.studentProfile.findFirst({
    where: { id: input.studentId, tenantId: input.tenantId },
    select: { id: true },
  });
  if (!student) {
    throw new TenantMismatchError("Student does not belong to this academy");
  }

  return prisma.certificate.create({ data: input });
}

export async function listCertificatesForStudent(tenantId: string, studentId: string) {
  return prisma.certificate.findMany({
    where: { tenantId, studentId },
    orderBy: { issuedAtUtc: "desc" },
  });
}

export async function listCertificatesForTenant(tenantId: string) {
  return prisma.certificate.findMany({
    where: { tenantId },
    include: { student: { include: { user: true } } },
    orderBy: { issuedAtUtc: "desc" },
  });
}
