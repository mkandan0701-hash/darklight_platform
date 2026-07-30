import { randomUUID } from "node:crypto";
import { prisma } from "@chessplay-clone/db";

export async function createLiveSession(input: {
  tenantId: string;
  classroomId: string;
  scheduledAtUtc: Date;
  durationMins: number;
}) {
  return prisma.$transaction(async (tx) => {
    // socketRoomId must be unique at insert time; the row's own id (unknown
    // until after create) becomes the real value right after.
    const created = await tx.liveSession.create({
      data: { ...input, socketRoomId: randomUUID() },
    });
    return tx.liveSession.update({
      where: { id: created.id },
      data: { socketRoomId: created.id },
    });
  });
}

export async function listUpcomingSessions(tenantId: string, classroomId: string) {
  return prisma.liveSession.findMany({
    where: { tenantId, classroomId, scheduledAtUtc: { gte: new Date() } },
    orderBy: { scheduledAtUtc: "asc" },
  });
}

export async function getLiveSession(tenantId: string, liveSessionId: string) {
  return prisma.liveSession.findFirst({
    where: { id: liveSessionId, tenantId },
  });
}
