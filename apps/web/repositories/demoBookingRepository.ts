import { prisma } from "@chessplay-clone/db";

// DemoBooking is intentionally not tenant-scoped (see the model comment in
// packages/db/prisma/schema.prisma) — a prospect booking a demo has no Tenant
// yet, so there is no tenantId to filter on.

export async function createDemoBooking(input: {
  name: string;
  email: string;
  academyName: string | null;
  studentCount: string | null;
  notes: string | null;
  slotAtUtc: Date;
  timezone: string;
}) {
  return prisma.demoBooking.create({ data: input });
}

// Slots already taken, so the picker can grey them out. Bounded to a single
// day's range to keep the query small.
export async function listBookedSlotsBetween(fromUtc: Date, toUtc: Date) {
  return prisma.demoBooking.findMany({
    where: { slotAtUtc: { gte: fromUtc, lt: toUtc } },
    select: { slotAtUtc: true },
  });
}
