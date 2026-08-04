import { randomUUID } from "node:crypto";
import { prisma } from "@chessplay-clone/db";
import {
  visibleClassroomWhere,
  type ClassroomViewer,
} from "./classroomRepository";

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
      // tenantId is required here even though id alone is unique: tenantScope
      // guards `update` on every tenant-scoped model, and a where without it
      // is refused in both ambient and no-context modes. Without this the
      // whole function threw, so scheduling a session never worked.
      where: { id: created.id, tenantId: input.tenantId },
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

// Attendance is marked for sessions that have already happened, and
// listUpcomingSessions filters to `gte: now` — so nothing existing can list
// the sessions a coach actually needs to mark. Newest first, since the class
// you just taught is the one you want.
export async function listSessionsForClassroom(
  tenantId: string,
  classroomId: string,
  take: number
) {
  return prisma.liveSession.findMany({
    where: { tenantId, classroomId },
    orderBy: { scheduledAtUtc: "desc" },
    take,
  });
}

// The dashboard home needs "what's next" across every classroom a person
// belongs to, not one at a time. Fanning out listUpcomingSessions per
// classroom would be N queries and would lose the classroom name each row
// needs as its label.
export async function listUpcomingSessionsForClassrooms(
  tenantId: string,
  classroomIds: string[],
  take: number
) {
  if (classroomIds.length === 0) return [];
  return prisma.liveSession.findMany({
    where: {
      tenantId,
      classroomId: { in: classroomIds },
      scheduledAtUtc: { gte: new Date() },
    },
    include: { classroom: true },
    orderBy: { scheduledAtUtc: "asc" },
    take,
  });
}

// Tenant-scoped but NOT membership-scoped — same contract as getClassroom.
// For callers that have already established the actor's right to this session
// another way (attendance's role gate plus isCoachAssignedToClassroom, or the
// audio action's own roster check). Anything reachable by a user-supplied id
// should use getLiveSessionForViewer instead.
export async function getLiveSession(tenantId: string, liveSessionId: string) {
  return prisma.liveSession.findFirst({
    where: { id: liveSessionId, tenantId },
  });
}

// Null for a session in a classroom the viewer isn't in, so the page 404s
// rather than rendering it.
//
// The socket layer already refuses the board itself — canAccessLiveSession
// re-checks classroom membership on join-room, so an outsider loading this
// page never got a working board. What they did get was the scheduled time
// and duration of any session in the academy, and a page that looks like it
// should work. Authorization belongs at both layers: the socket protects the
// board, this protects the page.
export async function getLiveSessionForViewer(
  viewer: ClassroomViewer,
  liveSessionId: string
) {
  return prisma.liveSession.findFirst({
    where: {
      id: liveSessionId,
      tenantId: viewer.tenantId,
      classroom: visibleClassroomWhere(viewer),
    },
  });
}
