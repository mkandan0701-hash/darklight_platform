import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { prisma, type CalendarBlockKind, type Prisma } from "@chessplay-clone/db";
import { visibleClassroomWhere, type ClassroomViewer } from "./classroomRepository";
import { TenantMismatchError } from "../lib/auth/errors";
import { displayName } from "../lib/displayName";
import { effectiveSessionStatus } from "../lib/liveSession";
import {
  HOMEWORK_DISPLAY_MINS,
  SIMUL_DISPLAY_MINS,
  TOURNAMENT_DISPLAY_MINS,
  clockStatus,
  type CalendarEvent,
  type CalendarStatus,
  type SeriesRef,
} from "../lib/calendar/events";
import { matchConflicts, type ConflictCandidate, type ScheduleConflict } from "../lib/calendar/conflicts";

// The calendar is a read across rows that already exist — LiveSession,
// Assignment, Tournament, Simul — plus CalendarBlock for the few things that
// have no other home (holidays, blocked time). It deliberately does NOT keep
// a per-user copy of events: who sees a class is answered by the classroom
// roster at read time, through the same visibleClassroomWhere rule every
// other page uses. That is what makes a newly enrolled student see the
// class's upcoming sessions immediately, and a reschedule show up for
// everyone at once — there is exactly one row to change.

/** Longest class the app allows (scheduleSessionAction caps at 240). */
export const MAX_SESSION_MINS = 240;

/** Ceiling per source per range — a month for a large academy, with headroom. */
const MAX_ROWS_PER_SOURCE = 1500;

export type CalendarViewer = ClassroomViewer & {
  /** The viewer's own CoachProfile id, when they are a coach. */
  coachProfileId: string | null;
};

/**
 * Narrowing on top of what the viewer may see. Every field only ever
 * shrinks the result — the page resolves these (a parent's `child` is checked
 * against getChildForParent first), and the queries below also intersect them
 * with visibleClassroomWhere, so a forged id can only yield an empty calendar.
 */
export type CalendarScope = {
  coachProfileId?: string;
  studentProfileId?: string;
};

export class ConcurrentEditError extends Error {}

const isStaffRole = (role: string) => role === "ACADEMY_ADMIN" || role === "COACH";

const iso = (d: Date) => d.toISOString();
const addMins = (d: Date, mins: number) => new Date(d.getTime() + mins * 60_000);

function lifecycleToStatus(s: ReturnType<typeof effectiveSessionStatus>): CalendarStatus {
  return s === "SCHEDULED" ? "UPCOMING" : s;
}

function classroomScopeWhere(viewer: CalendarViewer, scope: CalendarScope): Prisma.ClassroomWhereInput {
  return {
    AND: [
      visibleClassroomWhere(viewer),
      ...(scope.coachProfileId ? [{ coaches: { some: { coachId: scope.coachProfileId } } }] : []),
      ...(scope.studentProfileId ? [{ students: { some: { studentId: scope.studentProfileId } } }] : []),
    ],
  };
}

const PERSON = { select: { displayName: true, email: true } } as const;

export async function listCalendarEvents(
  viewer: CalendarViewer,
  scope: CalendarScope,
  range: { startUtc: Date; endUtc: Date },
  now: Date = new Date()
): Promise<CalendarEvent[]> {
  const [classes, homework, tournaments, simuls, blocks] = await Promise.all([
    listClassEvents(viewer, scope, range, now),
    listHomeworkEvents(viewer, scope, range, now),
    listTournamentEvents(viewer, scope, range, now),
    listSimulEvents(viewer, scope, range, now),
    listBlockEvents(viewer, scope, range, now),
  ]);
  return [...classes, ...homework, ...tournaments, ...simuls, ...blocks];
}

async function listClassEvents(
  viewer: CalendarViewer,
  scope: CalendarScope,
  range: { startUtc: Date; endUtc: Date },
  now: Date
): Promise<CalendarEvent[]> {
  const isStaff = isStaffRole(viewer.role);
  const rows = await prisma.liveSession.findMany({
    where: {
      tenantId: viewer.tenantId,
      // A class that started before the range but runs into it still shows.
      scheduledAtUtc: { gte: addMins(range.startUtc, -MAX_SESSION_MINS), lt: range.endUtc },
      classroom: classroomScopeWhere(viewer, scope),
    },
    include: {
      classroom: {
        select: {
          id: true,
          name: true,
          meetingUrl: true,
          coaches: { select: { coachId: true, coach: { select: { user: PERSON } } } },
          students: { select: { studentId: true, student: { select: { user: PERSON } } } },
        },
      },
      scheduleSlot: { select: { timezone: true } },
      _count: { select: { attendance: true, changes: { where: { kind: "RESCHEDULED" } } } },
    },
    orderBy: { scheduledAtUtc: "asc" },
    take: MAX_ROWS_PER_SOURCE,
  });

  // A student (or a parent looking at one child) sees their own attendance
  // mark, not the class's count.
  const presentBySession = new Map<string, boolean>();
  if (!isStaff && scope.studentProfileId && rows.length > 0) {
    const marks = await prisma.attendanceRecord.findMany({
      where: {
        tenantId: viewer.tenantId,
        studentId: scope.studentProfileId,
        liveSessionId: { in: rows.map((r) => r.id) },
      },
      select: { liveSessionId: true, present: true },
    });
    for (const m of marks) presentBySession.set(m.liveSessionId, m.present);
  }

  return rows
    .map((row): CalendarEvent => {
      const end = addMins(row.scheduledAtUtc, Math.max(0, row.durationMins));
      const coachIds = row.classroom.coaches.map((c) => c.coachId);
      const series: SeriesRef | null = row.scheduleSlotId
        ? { kind: "SLOT", id: row.scheduleSlotId }
        : row.seriesId
          ? { kind: "SERIES", id: row.seriesId }
          : null;
      return {
        id: `CLASS:${row.id}`,
        sourceId: row.id,
        category: "CLASS",
        title: row.classroom.name,
        startUtc: iso(row.scheduledAtUtc),
        endUtc: iso(end),
        allDay: false,
        status: lifecycleToStatus(effectiveSessionStatus(row, now)),
        rescheduled: row._count.changes > 0,
        href: `/dashboard/classrooms/${row.classroomId}/sessions/${row.id}`,
        meetingUrl: row.meetingUrl ?? row.classroom.meetingUrl,
        coachNames: row.classroom.coaches.map((c) => displayName(c.coach.user)),
        participants: {
          count: row.classroom.students.length,
          // Classmates' names are staff-only — a student sees the group size.
          ...(isStaff ? { names: row.classroom.students.map((s) => displayName(s.student.user)) } : {}),
        },
        format: row.classroom.students.length === 1 ? "INDIVIDUAL" : "GROUP",
        classroomId: row.classroomId,
        timezone: row.timezone ?? row.scheduleSlot?.timezone ?? null,
        durationMins: row.durationMins,
        series,
        canEdit:
          viewer.role === "ACADEMY_ADMIN" ||
          (viewer.role === "COACH" && !!viewer.coachProfileId && coachIds.includes(viewer.coachProfileId)),
        version: iso(row.updatedAt),
        attendance: isStaff
          ? { marked: row._count.attendance }
          : { marked: 0, present: presentBySession.get(row.id) ?? null },
      };
    })
    // The query reaches back MAX_SESSION_MINS for classes running into the
    // range; drop the ones that ended before it began.
    .filter((e) => new Date(e.endUtc) > range.startUtc || new Date(e.startUtc) >= range.startUtc);
}

async function listHomeworkEvents(
  viewer: CalendarViewer,
  scope: CalendarScope,
  range: { startUtc: Date; endUtc: Date },
  now: Date
): Promise<CalendarEvent[]> {
  const rows = await prisma.assignment.findMany({
    where: {
      tenantId: viewer.tenantId,
      dueAtUtc: { gte: range.startUtc, lt: range.endUtc },
      classroom: classroomScopeWhere(viewer, scope),
    },
    select: {
      id: true,
      title: true,
      dueAtUtc: true,
      classroom: {
        select: { id: true, name: true, coaches: { select: { coach: { select: { user: PERSON } } } } },
      },
    },
    orderBy: { dueAtUtc: "asc" },
    take: MAX_ROWS_PER_SOURCE,
  });
  return rows.flatMap((row): CalendarEvent[] => {
    if (!row.dueAtUtc) return [];
    return [
      {
        id: `HOMEWORK:${row.id}`,
        sourceId: row.id,
        category: "HOMEWORK",
        title: row.title,
        subtitle: row.classroom.name,
        // A deadline is an instant. It is drawn as a short block ending at the
        // deadline so the week grid has something to show, but bucketed by the
        // instant itself so an 11:59 PM deadline stays on its own day.
        startUtc: iso(addMins(row.dueAtUtc, -HOMEWORK_DISPLAY_MINS)),
        endUtc: iso(row.dueAtUtc),
        allDay: false,
        status: row.dueAtUtc > now ? "UPCOMING" : "COMPLETED",
        rescheduled: false,
        // Parents have no Homework page (navLinks hides it); the child page covers it.
        href: viewer.role === "PARENT" ? undefined : `/dashboard/homework/${row.id}`,
        coachNames: row.classroom.coaches.map((c) => displayName(c.coach.user)),
        classroomId: row.classroom.id,
        canEdit: false,
      },
    ];
  });
}

async function listTournamentEvents(
  viewer: CalendarViewer,
  scope: CalendarScope,
  range: { startUtc: Date; endUtc: Date },
  now: Date
): Promise<CalendarEvent[]> {
  // Tournaments are academy events, not classroom ones. Staff see all of them
  // (the Tournaments page already lists every one to every member). A
  // student's calendar — their own, or a parent's view of one child — shows
  // only the ones that student is entered in: the calendar is "where do I
  // have to be", and an event you aren't playing in isn't on it.
  if (!scope.studentProfileId && !isStaffRole(viewer.role)) return [];
  const rows = await prisma.tournament.findMany({
    where: {
      tenantId: viewer.tenantId,
      startsAtUtc: { gte: addMins(range.startUtc, -TOURNAMENT_DISPLAY_MINS), lt: range.endUtc },
      ...(scope.studentProfileId
        ? { participants: { some: { studentId: scope.studentProfileId } } }
        : {}),
    },
    select: { id: true, name: true, format: true, startsAtUtc: true, _count: { select: { participants: true } } },
    orderBy: { startsAtUtc: "asc" },
    take: MAX_ROWS_PER_SOURCE,
  });
  return rows.map((row): CalendarEvent => {
    const end = addMins(row.startsAtUtc, TOURNAMENT_DISPLAY_MINS);
    return {
      id: `TOURNAMENT:${row.id}`,
      sourceId: row.id,
      category: "TOURNAMENT",
      title: row.name,
      subtitle: row.format === "SWISS" ? "Swiss" : "Arena",
      startUtc: iso(row.startsAtUtc),
      endUtc: iso(end),
      allDay: false,
      status: clockStatus(row.startsAtUtc, end, now),
      rescheduled: false,
      href: `/dashboard/tournaments/${row.id}`,
      coachNames: [],
      participants: { count: row._count.participants },
      canEdit: false,
    };
  });
}

async function listSimulEvents(
  viewer: CalendarViewer,
  scope: CalendarScope,
  range: { startUtc: Date; endUtc: Date },
  now: Date
): Promise<CalendarEvent[]> {
  // Simul.coachId is a CoachProfile id stored without a relation, so who may
  // see one is expressed here rather than through a classroom.
  // Each rule only narrows: a coach is always held to their own simuls, even
  // with a student filter on top.
  const ownership: Prisma.SimulWhereInput[] = [];
  if (viewer.role === "ACADEMY_ADMIN") {
    if (scope.coachProfileId) ownership.push({ coachId: scope.coachProfileId });
  } else if (viewer.role === "COACH") {
    if (!viewer.coachProfileId) return [];
    ownership.push({ coachId: viewer.coachProfileId });
  } else if (!scope.studentProfileId) {
    return [];
  }
  if (scope.studentProfileId) ownership.push({ boards: { some: { studentId: scope.studentProfileId } } });

  const rows = await prisma.simul.findMany({
    where: {
      tenantId: viewer.tenantId,
      startsAtUtc: { gte: addMins(range.startUtc, -SIMUL_DISPLAY_MINS), lt: range.endUtc },
      AND: ownership,
    },
    include: { boards: { select: { id: true, studentId: true } } },
    orderBy: { startsAtUtc: "asc" },
    take: MAX_ROWS_PER_SOURCE,
  });
  if (rows.length === 0) return [];

  const coaches = await prisma.coachProfile.findMany({
    where: { tenantId: viewer.tenantId, id: { in: [...new Set(rows.map((r) => r.coachId))] } },
    select: { id: true, user: PERSON },
  });
  const coachName = new Map(coaches.map((c) => [c.id, displayName(c.user)]));

  return rows.map((row): CalendarEvent => {
    const end = addMins(row.startsAtUtc, SIMUL_DISPLAY_MINS);
    const myBoard = scope.studentProfileId
      ? row.boards.find((b) => b.studentId === scope.studentProfileId)
      : undefined;
    return {
      id: `SIMUL:${row.id}`,
      sourceId: row.id,
      category: "SIMUL",
      title: `Simul${coachName.get(row.coachId) ? ` with ${coachName.get(row.coachId)}` : ""}`,
      subtitle: `${row.boards.length} boards`,
      startUtc: iso(row.startsAtUtc),
      endUtc: iso(end),
      allDay: false,
      status: clockStatus(row.startsAtUtc, end, now),
      rescheduled: false,
      href:
        viewer.role === "STUDENT" && myBoard
          ? `/dashboard/simuls/boards/${myBoard.id}`
          : isStaffRole(viewer.role)
            ? "/dashboard/simuls"
            : undefined,
      coachNames: coachName.get(row.coachId) ? [coachName.get(row.coachId)!] : [],
      participants: { count: row.boards.length },
      canEdit: false,
    };
  });
}

async function listBlockEvents(
  viewer: CalendarViewer,
  scope: CalendarScope,
  range: { startUtc: Date; endUtc: Date },
  now: Date
): Promise<CalendarEvent[]> {
  const isStaff = isStaffRole(viewer.role);
  const visible: Prisma.CalendarBlockWhereInput[] = [
    { kind: "HOLIDAY" },
    { kind: "OTHER", ...(isStaff ? {} : { staffOnly: false }) },
  ];
  // Blocked time is between a coach and the admins who schedule them. It is
  // left off a student-scoped view even for staff: it says nothing about
  // where that student has to be.
  if (!scope.studentProfileId) {
    if (viewer.role === "ACADEMY_ADMIN") {
      visible.push({ kind: "UNAVAILABLE", ...(scope.coachProfileId ? { coachId: scope.coachProfileId } : {}) });
    } else if (viewer.role === "COACH" && viewer.coachProfileId) {
      visible.push({ kind: "UNAVAILABLE", coachId: viewer.coachProfileId });
    }
  }

  const rows = await prisma.calendarBlock.findMany({
    where: {
      tenantId: viewer.tenantId,
      deletedAt: null,
      startsAtUtc: { lt: range.endUtc },
      endsAtUtc: { gt: range.startUtc },
      OR: visible,
    },
    include: { coach: { select: { user: PERSON } } },
    orderBy: { startsAtUtc: "asc" },
    take: MAX_ROWS_PER_SOURCE,
  });

  return rows.map((row): CalendarEvent => ({
    id: `${row.kind}:${row.id}`,
    sourceId: row.id,
    category: row.kind,
    title: row.title,
    subtitle: row.kind === "UNAVAILABLE" && row.coach ? displayName(row.coach.user) : undefined,
    description: row.description,
    startUtc: iso(row.startsAtUtc),
    endUtc: iso(row.endsAtUtc),
    allDay: row.allDay,
    status: clockStatus(row.startsAtUtc, row.endsAtUtc, now),
    rescheduled: false,
    coachNames: row.kind === "UNAVAILABLE" && row.coach ? [displayName(row.coach.user)] : [],
    timezone: row.timezone,
    canEdit:
      viewer.role === "ACADEMY_ADMIN" ||
      (viewer.role === "COACH" && row.kind === "UNAVAILABLE" && row.coachId === viewer.coachProfileId),
    version: iso(row.updatedAt),
    coachProfileId: row.coachId,
    staffOnly: row.staffOnly,
  }));
}

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

/**
 * Every clash the proposed times would create for this classroom's coaches
 * and students: other classes they're in, academy holidays, and the coaches'
 * own blocked time. Cancelled classes don't clash. `excludeSessionIds` are
 * the sessions being moved, so a class never clashes with its old self.
 */
export async function findScheduleConflicts(
  tenantId: string,
  input: {
    classroomId: string;
    proposed: { startUtc: Date; endUtc: Date }[];
    excludeSessionIds?: string[];
  }
): Promise<ScheduleConflict[]> {
  if (input.proposed.length === 0) return [];
  const classroom = await prisma.classroom.findFirst({
    where: { id: input.classroomId, tenantId, deletedAt: null },
    select: {
      coaches: { select: { coachId: true, coach: { select: { user: PERSON } } } },
      students: { select: { studentId: true, student: { select: { user: PERSON } } } },
    },
  });
  if (!classroom) throw new TenantMismatchError("Classroom does not belong to this academy");

  const coachIds = classroom.coaches.map((c) => c.coachId);
  const studentIds = classroom.students.map((s) => s.studentId);
  const coachName = new Map(classroom.coaches.map((c) => [c.coachId, displayName(c.coach.user)]));
  const studentName = new Map(classroom.students.map((s) => [s.studentId, displayName(s.student.user)]));

  const windowStart = new Date(Math.min(...input.proposed.map((p) => p.startUtc.getTime())));
  const windowEnd = new Date(Math.max(...input.proposed.map((p) => p.endUtc.getTime())));

  const people: Prisma.ClassroomWhereInput[] = [
    ...(coachIds.length ? [{ coaches: { some: { coachId: { in: coachIds } } } }] : []),
    ...(studentIds.length ? [{ students: { some: { studentId: { in: studentIds } } } }] : []),
  ];

  const [sessions, blocks] = await Promise.all([
    people.length === 0
      ? Promise.resolve([])
      : prisma.liveSession.findMany({
          where: {
            tenantId,
            status: { not: "CANCELLED" },
            ...(input.excludeSessionIds?.length ? { id: { notIn: input.excludeSessionIds } } : {}),
            scheduledAtUtc: { gte: addMins(windowStart, -MAX_SESSION_MINS), lt: windowEnd },
            classroom: { deletedAt: null, OR: people },
          },
          select: {
            scheduledAtUtc: true,
            durationMins: true,
            classroom: {
              select: {
                name: true,
                coaches: { select: { coachId: true } },
                students: { select: { studentId: true } },
              },
            },
          },
          take: 2000,
        }),
    prisma.calendarBlock.findMany({
      where: {
        tenantId,
        deletedAt: null,
        startsAtUtc: { lt: windowEnd },
        endsAtUtc: { gt: windowStart },
        OR: [{ kind: "HOLIDAY" }, ...(coachIds.length ? [{ kind: "UNAVAILABLE" as const, coachId: { in: coachIds } }] : [])],
      },
      select: { kind: true, title: true, startsAtUtc: true, endsAtUtc: true, coachId: true },
    }),
  ]);

  const candidates: ConflictCandidate[] = [];
  for (const s of sessions) {
    const startUtc = s.scheduledAtUtc;
    const endUtc = addMins(startUtc, Math.max(0, s.durationMins));
    for (const c of s.classroom.coaches) {
      if (coachName.has(c.coachId)) {
        candidates.push({ reason: "COACH", who: coachName.get(c.coachId)!, what: s.classroom.name, startUtc, endUtc });
      }
    }
    for (const st of s.classroom.students) {
      if (studentName.has(st.studentId)) {
        candidates.push({ reason: "STUDENT", who: studentName.get(st.studentId)!, what: s.classroom.name, startUtc, endUtc });
      }
    }
  }
  for (const b of blocks) {
    if (b.kind === "HOLIDAY") {
      candidates.push({ reason: "HOLIDAY", who: "", what: b.title, startUtc: b.startsAtUtc, endUtc: b.endsAtUtc });
    } else if (b.coachId) {
      candidates.push({
        reason: "COACH_UNAVAILABLE",
        who: coachName.get(b.coachId) ?? "Coach",
        what: b.title,
        startUtc: b.startsAtUtc,
        endUtc: b.endsAtUtc,
      });
    }
  }
  return matchConflicts(input.proposed, candidates);
}

// ---------------------------------------------------------------------------
// Class writes. Every change writes a LiveSessionChange row in the same
// transaction — the audit trail and the "Rescheduled" label both depend on it.
// ---------------------------------------------------------------------------

type Audit = { actorUserId: string; conflictOverride?: boolean; conflictSummary?: string | null };

export async function getSessionForCalendarEdit(tenantId: string, liveSessionId: string) {
  return prisma.liveSession.findFirst({
    where: { id: liveSessionId, tenantId, classroom: { deletedAt: null } },
    include: {
      scheduleSlot: true,
      classroom: { select: { coaches: { select: { coachId: true } } } },
      _count: { select: { attendance: true } },
    },
  });
}

/**
 * One-off or finite-recurrence classes from the calendar. All occurrences or
 * none: half a series is not something a coach can sensibly finish later.
 */
export async function createCalendarSessions(
  tenantId: string,
  input: {
    classroomId: string;
    occurrences: { startUtc: Date }[];
    durationMins: number;
    timezone: string;
    meetingUrl: string | null;
  },
  audit: Audit
) {
  const classroom = await prisma.classroom.findFirst({
    where: { id: input.classroomId, tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!classroom) throw new TenantMismatchError("Classroom does not belong to this academy");

  const seriesId = input.occurrences.length > 1 ? randomUUID() : null;
  return prisma.$transaction(async (tx) => {
    const created = await tx.liveSession.createManyAndReturn({
      data: input.occurrences.map((o) => ({
        tenantId,
        classroomId: input.classroomId,
        scheduledAtUtc: o.startUtc,
        durationMins: input.durationMins,
        timezone: input.timezone,
        meetingUrl: input.meetingUrl,
        seriesId,
        // Same as materializeSlot: unique at insert, nothing derives from it.
        socketRoomId: randomUUID(),
      })),
      select: { id: true, scheduledAtUtc: true },
    });
    await tx.liveSessionChange.createMany({
      data: created.map((s) => ({
        tenantId,
        liveSessionId: s.id,
        kind: "CREATED" as const,
        changedByUserId: audit.actorUserId,
        newStartUtc: s.scheduledAtUtc,
        newDurationMins: input.durationMins,
        conflictOverride: audit.conflictOverride ?? false,
        conflictSummary: audit.conflictSummary ?? null,
      })),
    });
    return { count: created.length, seriesId };
  });
}

export type SessionMove = {
  id: string;
  /** updatedAt the editor saw; omitted for siblings moved along with it. */
  expectedVersion?: Date;
  fromStartUtc: Date;
  fromDurationMins: number;
  toStartUtc: Date;
  toDurationMins: number;
  /** Set when a slot series is split: the row joins the new template. */
  scheduleSlotId?: string;
  occurrenceDate?: string;
};

// The tenant-scoped client's transaction handle. Prisma.TransactionClient is
// the *unextended* one, which would accept a query tenantScope never sees.
// Same members Prisma strips from an interactive-transaction client.
type Tx = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

async function applyMoves(tx: Tx, tenantId: string, moves: SessionMove[], audit: Audit) {
  for (const m of moves) {
    const result = await tx.liveSession.updateMany({
      where: {
        id: m.id,
        tenantId,
        status: { not: "CANCELLED" },
        // Optimistic concurrency: if someone else saved this class since the
        // editor loaded it, refuse rather than silently overwrite their change.
        ...(m.expectedVersion ? { updatedAt: m.expectedVersion } : {}),
      },
      data: {
        scheduledAtUtc: m.toStartUtc,
        durationMins: m.toDurationMins,
        ...(m.scheduleSlotId ? { scheduleSlotId: m.scheduleSlotId, occurrenceDate: m.occurrenceDate } : {}),
      },
    });
    if (result.count === 0) {
      throw new ConcurrentEditError("This class was changed or cancelled by someone else");
    }
  }
  await tx.liveSessionChange.createMany({
    data: moves.map((m) => ({
      tenantId,
      liveSessionId: m.id,
      kind: "RESCHEDULED" as const,
      changedByUserId: audit.actorUserId,
      previousStartUtc: m.fromStartUtc,
      previousDurationMins: m.fromDurationMins,
      newStartUtc: m.toStartUtc,
      newDurationMins: m.toDurationMins,
      conflictOverride: audit.conflictOverride ?? false,
      conflictSummary: audit.conflictSummary ?? null,
    })),
  });
}

export async function rescheduleSessions(tenantId: string, moves: SessionMove[], audit: Audit) {
  if (moves.length === 0) return;
  await prisma.$transaction((tx) => applyMoves(tx, tenantId, moves, audit));
}

/**
 * Moves part of an open-ended weekly series to a new day/time. The old
 * template is retired and a new one starts on the first moved date, so the
 * nightly materializer keeps producing classes at the new time from there on
 * and never backfills the weeks the old template still owns. The moved rows
 * (cancelled ones too, so a cancelled week stays cancelled) join the new
 * template with their new local dates — which is what makes the follow-up
 * materializeSlot a no-op for them instead of a duplicate.
 */
export async function splitSlotSeries(
  tenantId: string,
  input: {
    oldSlotId: string;
    newSlot: { dayOfWeek: number; localTime: string; timezone: string; durationMins: number; startsOn: string };
    moves: SessionMove[];
    cancelledFollowers: { id: string; toStartUtc: Date; occurrenceDate: string }[];
  },
  audit: Audit
) {
  return prisma.$transaction(async (tx) => {
    const old = await tx.classroomScheduleSlot.findFirst({
      where: { id: input.oldSlotId, tenantId, isActive: true, deletedAt: null },
    });
    if (!old) throw new ConcurrentEditError("This weekly schedule was changed by someone else");
    await tx.classroomScheduleSlot.updateMany({
      where: { id: old.id, tenantId },
      data: { isActive: false, deletedAt: new Date() },
    });
    const slot = await tx.classroomScheduleSlot.create({
      data: { tenantId, classroomId: old.classroomId, ...input.newSlot },
    });
    await applyMoves(
      tx,
      tenantId,
      input.moves.map((m) => ({ ...m, scheduleSlotId: slot.id })),
      audit
    );
    for (const c of input.cancelledFollowers) {
      await tx.liveSession.updateMany({
        where: { id: c.id, tenantId, status: "CANCELLED" },
        data: { scheduleSlotId: slot.id, occurrenceDate: c.occurrenceDate, scheduledAtUtc: c.toStartUtc },
      });
    }
    return slot;
  });
}

/** Sessions of one series from `fromUtc` on that haven't been held. */
export async function listSeriesSessionsFrom(
  tenantId: string,
  series: SeriesRef,
  fromUtc: Date,
  opts: { includeCancelled?: boolean } = {}
) {
  return prisma.liveSession.findMany({
    where: {
      tenantId,
      ...(series.kind === "SLOT" ? { scheduleSlotId: series.id } : { seriesId: series.id }),
      scheduledAtUtc: { gte: fromUtc },
      startedAtUtc: null,
      ...(opts.includeCancelled ? {} : { status: { not: "CANCELLED" } }),
    },
    orderBy: { scheduledAtUtc: "asc" },
  });
}

/**
 * Sticky, like cancelLiveSession. `retireSlotId` also stops an open-ended
 * weekly template, for "cancel all upcoming" — otherwise the nightly sweep
 * would put the series straight back on the calendar.
 */
export async function cancelSessions(
  tenantId: string,
  sessions: { id: string; scheduledAtUtc: Date; durationMins: number }[],
  audit: Audit,
  opts: { retireSlotId?: string } = {}
) {
  return prisma.$transaction(async (tx) => {
    const result = await tx.liveSession.updateMany({
      where: { tenantId, id: { in: sessions.map((s) => s.id) }, status: { not: "CANCELLED" } },
      data: { status: "CANCELLED" },
    });
    await tx.liveSessionChange.createMany({
      data: sessions.map((s) => ({
        tenantId,
        liveSessionId: s.id,
        kind: "CANCELLED" as const,
        changedByUserId: audit.actorUserId,
        previousStartUtc: s.scheduledAtUtc,
        previousDurationMins: s.durationMins,
      })),
    });
    if (opts.retireSlotId) {
      await tx.classroomScheduleSlot.updateMany({
        where: { id: opts.retireSlotId, tenantId },
        data: { isActive: false, deletedAt: new Date() },
      });
    }
    return result.count;
  });
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

export type BlockInput = {
  kind: CalendarBlockKind;
  title: string;
  description: string | null;
  startsAtUtc: Date;
  endsAtUtc: Date;
  timezone: string;
  allDay: boolean;
  coachId: string | null;
  staffOnly: boolean;
};

async function assertCoachInTenant(tenantId: string, coachId: string | null) {
  if (!coachId) return;
  const coach = await prisma.coachProfile.findFirst({ where: { id: coachId, tenantId }, select: { id: true } });
  if (!coach) throw new TenantMismatchError("Coach does not belong to this academy");
}

export async function createCalendarBlock(tenantId: string, input: BlockInput, actorUserId: string) {
  await assertCoachInTenant(tenantId, input.coachId);
  return prisma.calendarBlock.create({ data: { tenantId, ...input, createdByUserId: actorUserId } });
}

export async function getCalendarBlock(tenantId: string, blockId: string) {
  return prisma.calendarBlock.findFirst({ where: { id: blockId, tenantId, deletedAt: null } });
}

export async function updateCalendarBlock(
  tenantId: string,
  blockId: string,
  expectedVersion: Date,
  input: BlockInput
) {
  await assertCoachInTenant(tenantId, input.coachId);
  const result = await prisma.calendarBlock.updateMany({
    where: { id: blockId, tenantId, deletedAt: null, updatedAt: expectedVersion },
    data: input,
  });
  if (result.count === 0) throw new ConcurrentEditError("This entry was changed or removed by someone else");
}

/** Soft delete (claude.md §4) — the row stays for the audit trail. */
export async function deleteCalendarBlock(tenantId: string, blockId: string) {
  const result = await prisma.calendarBlock.updateMany({
    where: { id: blockId, tenantId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count > 0;
}

// ---------------------------------------------------------------------------
// Pickers for the toolbar and the event form
// ---------------------------------------------------------------------------

export async function listCoachOptions(tenantId: string) {
  const coaches = await prisma.coachProfile.findMany({
    where: { tenantId, user: { deletedAt: null } },
    select: { id: true, user: PERSON },
  });
  return coaches
    .map((c) => ({ id: c.id, label: displayName(c.user) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Students in the classrooms this viewer can see — all of them, for an admin. */
export async function listStudentOptions(viewer: CalendarViewer) {
  const students = await prisma.studentProfile.findMany({
    where: {
      tenantId: viewer.tenantId,
      user: { deletedAt: null },
      ...(viewer.role === "ACADEMY_ADMIN"
        ? {}
        : { classrooms: { some: { classroom: visibleClassroomWhere(viewer) } } }),
    },
    select: { id: true, user: PERSON },
  });
  return students
    .map((s) => ({ id: s.id, label: displayName(s.user) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Classrooms this viewer may schedule into, with what the form needs to prefill. */
export async function listSchedulableClassrooms(viewer: CalendarViewer) {
  const rooms = await prisma.classroom.findMany({
    where: { tenantId: viewer.tenantId, ...visibleClassroomWhere(viewer) },
    select: {
      id: true,
      name: true,
      meetingUrl: true,
      coaches: { select: { coach: { select: { user: PERSON } } } },
      _count: { select: { students: true } },
    },
    orderBy: { name: "asc" },
  });
  return rooms.map((r) => ({
    id: r.id,
    name: r.name,
    meetingUrl: r.meetingUrl,
    coachNames: r.coaches.map((c) => displayName(c.coach.user)),
    studentCount: r._count.students,
  }));
}

/** Local "yyyy-LL-dd" of a UTC instant in `zone`. */
export function localDate(utc: Date, zone: string): string {
  return DateTime.fromJSDate(utc, { zone }).toFormat("yyyy-LL-dd");
}
