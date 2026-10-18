import { prisma, type Federation, type RatingRecord } from "@chessplay-clone/db";
import { TenantMismatchError } from "../lib/auth/errors";

export async function recordRating(input: {
  tenantId: string;
  studentId: string;
  federation: Federation;
  rating: number;
  recordedByUserId: string;
}) {
  // Same guard as createInvoice: the row carries the caller's own tenantId,
  // so tenantScope is satisfied whoever the student actually belongs to —
  // only this check catches a studentId borrowed from another academy.
  const student = await prisma.studentProfile.findFirst({
    where: { id: input.studentId, tenantId: input.tenantId },
    select: { id: true },
  });
  if (!student) {
    throw new TenantMismatchError("Student does not belong to this academy");
  }

  return prisma.ratingRecord.create({ data: input });
}

export async function listRatingsForStudent(tenantId: string, studentId: string) {
  return prisma.ratingRecord.findMany({
    where: { tenantId, studentId },
    orderBy: { recordedAtUtc: "desc" },
  });
}

/**
 * The most recent rating per federation, for "current standing" displays and
 * for RATING_MILESTONE certificates.
 *
 * One findMany plus a reduce rather than a groupBy: the tenant-scoping
 * extension guards `findMany`, and routing this through an aggregate would
 * put it outside that guard for no gain at this row count (a student has a
 * handful of rating records, not thousands).
 */
export async function getLatestRatingByFederation(tenantId: string, studentId: string) {
  const records = await listRatingsForStudent(tenantId, studentId);
  const latest = new Map<Federation, RatingRecord>();
  for (const record of records) {
    // Already sorted newest-first, so the first sighting of a federation wins.
    if (!latest.has(record.federation)) latest.set(record.federation, record);
  }
  return latest;
}
