import { randomUUID } from "node:crypto";
import { prisma, type Prisma } from "@chessplay-clone/db";
import {
  visibleClassroomWhere,
  type ClassroomViewer,
} from "./classroomRepository";
import {
  CURRENT_LEAD_MINS,
  DELAYED_WINDOW_DAYS,
  sessionBucket,
  type SessionBucket,
} from "../lib/liveSession";

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
    // A cancelled class is not upcoming, whatever its clock says. Everything
    // else about the lifecycle is derived (lib/liveSession.ts); CANCELLED is
    // the one state stored on the row, so it is the one state a query filters.
    where: {
      tenantId,
      classroomId,
      status: { not: "CANCELLED" },
      scheduledAtUtc: { gte: new Date() },
    },
    orderBy: { scheduledAtUtc: "asc" },
  });
}

// Sticky and deliberately one-way: there is no un-cancel. Reinstating a class
// people were told was off should be a new session with a new invitation, not
// a silent revert.
export async function cancelLiveSession(tenantId: string, liveSessionId: string) {
  const result = await prisma.liveSession.updateMany({
    where: { id: liveSessionId, tenantId },
    data: { status: "CANCELLED" },
  });
  return result.count > 0;
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
      status: { not: "CANCELLED" },
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
    // The room's standing meeting link (the session's own override is on the
    // row) and the attendance fact sessionBucket needs for the Start button.
    include: {
      classroom: { select: { meetingUrl: true } },
      _count: { select: { attendance: true } },
    },
  });
}

// ---------------------------------------------------------------------------
// Classroom management board — every session the viewer can see, across all
// their classrooms, one tab at a time.
// ---------------------------------------------------------------------------

const PERSON_SELECT = {
  select: { id: true, displayName: true, email: true, timezone: true },
} as const;

const BOARD_INCLUDE = {
  classroom: {
    select: {
      id: true,
      name: true,
      meetingUrl: true,
      coaches: { select: { coachId: true, coach: { select: { user: PERSON_SELECT } } } },
      students: { select: { studentId: true, student: { select: { user: PERSON_SELECT } } } },
    },
  },
  _count: { select: { attendance: true } },
} satisfies Prisma.LiveSessionInclude;

export type BoardSession = Prisma.LiveSessionGetPayload<{ include: typeof BOARD_INCLUDE }>;

export type BoardFilters = {
  bucket: Exclude<SessionBucket, "CANCELLED">;
  q?: string;
  classroomId?: string;
  coachProfileId?: string;
};

// A ceiling on what one tab renders. Upcoming can run 8 weeks deep per weekly
// slot (see scheduleSlotRepository), so an academy with many rooms would
// otherwise render hundreds of cards nobody scrolls to.
const BOARD_PAGE_SIZE = 60;

// The longest a session can run (scheduleSessionAction caps durationMins at
// 240). Lets the CURRENT query bound its lower edge without reading duration.
const MAX_SESSION_MINS = 240;

/**
 * The coarse time window Postgres can filter on for each tab. The exact
 * bucket depends on duration, startedAtUtc and attendance, so sessionBucket()
 * makes the final call on whatever this returns.
 */
function bucketWindow(
  bucket: BoardFilters["bucket"],
  now: Date
): { where: Prisma.LiveSessionWhereInput; order: "asc" | "desc" } {
  const minutes = (n: number) => new Date(now.getTime() + n * 60_000);
  switch (bucket) {
    case "CURRENT":
      return {
        where: {
          scheduledAtUtc: { gte: minutes(-MAX_SESSION_MINS), lte: minutes(CURRENT_LEAD_MINS) },
        },
        order: "asc",
      };
    case "UPCOMING":
      return { where: { scheduledAtUtc: { gt: minutes(CURRENT_LEAD_MINS) } }, order: "asc" };
    case "DELAYED":
      return {
        where: {
          startedAtUtc: null,
          scheduledAtUtc: {
            gte: minutes(-(DELAYED_WINDOW_DAYS * 24 * 60 + MAX_SESSION_MINS)),
            lt: now,
          },
        },
        order: "desc",
      };
    case "COMPLETED":
      return { where: { scheduledAtUtc: { lt: now } }, order: "desc" };
  }
}

export async function listBoardSessionsForViewer(
  viewer: ClassroomViewer,
  filters: BoardFilters,
  now: Date = new Date()
): Promise<BoardSession[]> {
  const { where: windowWhere, order } = bucketWindow(filters.bucket, now);
  const q = filters.q?.trim();

  const rows = await prisma.liveSession.findMany({
    where: {
      tenantId: viewer.tenantId,
      status: { not: "CANCELLED" },
      ...windowWhere,
      ...(filters.classroomId ? { classroomId: filters.classroomId } : {}),
      // Membership first, then the viewer's narrowing on top of it — the
      // filters can only shrink what visibleClassroomWhere allows.
      classroom: {
        AND: [
          visibleClassroomWhere(viewer),
          ...(filters.coachProfileId
            ? [{ coaches: { some: { coachId: filters.coachProfileId } } }]
            : []),
          ...(q
            ? [
                {
                  OR: [
                    { name: { contains: q, mode: "insensitive" as const } },
                    {
                      students: {
                        some: {
                          student: {
                            user: {
                              OR: [
                                { displayName: { contains: q, mode: "insensitive" as const } },
                                { email: { contains: q, mode: "insensitive" as const } },
                              ],
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              ]
            : []),
        ],
      },
    },
    include: BOARD_INCLUDE,
    orderBy: { scheduledAtUtc: order },
    // Over-fetch: the time window is coarse, and some rows get dropped below.
    take: BOARD_PAGE_SIZE * 2,
  });

  return rows
    .filter(
      (row) =>
        sessionBucket(row, { hasAttendance: row._count.attendance > 0 }, now) === filters.bucket
    )
    .slice(0, BOARD_PAGE_SIZE);
}

/**
 * Records that the coach opened the class. Idempotent: pressing Start twice,
 * or after a dropped connection, keeps the first time — that's when the class
 * actually began.
 */
export async function markSessionStarted(
  tenantId: string,
  liveSessionId: string,
  at: Date = new Date()
): Promise<void> {
  await prisma.liveSession.updateMany({
    where: { id: liveSessionId, tenantId, startedAtUtc: null },
    data: { startedAtUtc: at },
  });
}

/** null clears the override, so the classroom's standing link applies again. */
export async function setSessionMeetingUrl(
  tenantId: string,
  liveSessionId: string,
  meetingUrl: string | null
): Promise<boolean> {
  const result = await prisma.liveSession.updateMany({
    where: { id: liveSessionId, tenantId },
    data: { meetingUrl },
  });
  return result.count > 0;
}

// getLiveSession plus the one fact sessionBucket needs that isn't on the row.
// Tenant-scoped, not membership-scoped — same contract as getLiveSession.
export async function getLiveSessionWithAttendanceCount(tenantId: string, liveSessionId: string) {
  return prisma.liveSession.findFirst({
    where: { id: liveSessionId, tenantId },
    include: { _count: { select: { attendance: true } } },
  });
}
