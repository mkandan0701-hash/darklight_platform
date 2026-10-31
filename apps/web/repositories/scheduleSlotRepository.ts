import { randomUUID } from "node:crypto";
import { prisma, type ClassroomScheduleSlot } from "@chessplay-clone/db";
import { computeUpcomingOccurrencesUtc } from "@chessplay-clone/shared";
import { TenantMismatchError } from "../lib/auth/errors";

const HORIZON_WEEKS = 8;

export async function createScheduleSlot(
  tenantId: string,
  classroomId: string,
  input: {
    dayOfWeek: number;
    localTime: string;
    timezone: string;
    durationMins: number;
    startsOn?: string | null;
  }
) {
  // Same guard as assignCoach/enrollStudent: the row being inserted carries
  // the caller's own tenantId, which satisfies tenantScope regardless of
  // whose classroom this actually is — only this check catches a classroom id
  // borrowed from another academy.
  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId, tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!classroom) {
    throw new TenantMismatchError("Classroom does not belong to this academy");
  }

  return prisma.classroomScheduleSlot.create({
    data: { tenantId, classroomId, ...input },
  });
}

export async function listActiveScheduleSlotsForClassroom(
  tenantId: string,
  classroomId: string
) {
  return prisma.classroomScheduleSlot.findMany({
    where: { tenantId, classroomId, isActive: true, deletedAt: null },
    orderBy: [{ dayOfWeek: "asc" }, { localTime: "asc" }],
  });
}

export async function getScheduleSlot(tenantId: string, scheduleSlotId: string) {
  return prisma.classroomScheduleSlot.findFirst({
    where: { id: scheduleSlotId, tenantId },
  });
}

// One-way, like cancelLiveSession: no un-remove. Already-materialized
// LiveSession rows are untouched — pulling a template doesn't cancel classes
// that were already put on the calendar from it.
export async function removeScheduleSlot(tenantId: string, scheduleSlotId: string) {
  const result = await prisma.classroomScheduleSlot.updateMany({
    where: { id: scheduleSlotId, tenantId },
    data: { isActive: false, deletedAt: new Date() },
  });
  return result.count > 0;
}

/**
 * Generates any missing upcoming LiveSession rows for one slot, out to a
 * fixed horizon. Safe to call repeatedly — the nightly worker and the
 * immediate top-up on slot creation both call this, and `skipDuplicates`
 * relying on `@@unique([scheduleSlotId, occurrenceDate])` is what makes a
 * re-run a no-op instead of a pile of duplicate classes.
 */
export async function materializeSlot(
  tenantId: string,
  slot: Pick<ClassroomScheduleSlot, "id" | "classroomId" | "dayOfWeek" | "localTime" | "timezone" | "durationMins"> &
    { startsOn?: string | null }
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
