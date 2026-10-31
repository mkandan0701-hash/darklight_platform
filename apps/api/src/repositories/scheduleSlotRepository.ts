import { randomUUID } from "node:crypto";
import { prisma, type ClassroomScheduleSlot } from "@chessplay-clone/db";
import { computeUpcomingOccurrencesUtc } from "@chessplay-clone/shared";

const HORIZON_WEEKS = 8;

// Called from inside runWithTenant(tenantId, ...) by the nightly sweep, so
// tenantScope verifies rather than merely trusts this filter.
export async function listActiveScheduleSlotsForTenant(tenantId: string) {
  return prisma.classroomScheduleSlot.findMany({
    where: { tenantId, isActive: true, deletedAt: null },
  });
}

// Same idempotent generation as apps/web's scheduleSlotRepository — kept as a
// separate copy rather than a shared import because apps/api and apps/web
// already keep independent repository layers for LiveSession itself (compare
// apps/api/src/repositories/liveSessionRepository.ts), each shaped for its
// own callers (socket handlers vs. Next server actions). The one piece that
// *is* shared is the recurrence math (computeUpcomingOccurrencesUtc in
// packages/shared) — duplicating that would risk the two sides drifting.
export async function materializeSlot(
  tenantId: string,
  slot: Pick<ClassroomScheduleSlot, "id" | "classroomId" | "dayOfWeek" | "localTime" | "timezone" | "durationMins"> &
    Partial<Pick<ClassroomScheduleSlot, "startsOn">>
) {
  const occurrences = computeUpcomingOccurrencesUtc(slot, { horizonWeeks: HORIZON_WEEKS });

  return prisma.liveSession.createMany({
    data: occurrences.map((occ) => ({
      tenantId,
      classroomId: slot.classroomId,
      scheduleSlotId: slot.id,
      occurrenceDate: occ.occurrenceDate,
      scheduledAtUtc: occ.scheduledAtUtc,
      durationMins: slot.durationMins,
      socketRoomId: randomUUID(),
    })),
    skipDuplicates: true,
  });
}
