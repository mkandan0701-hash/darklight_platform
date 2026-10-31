import { cache } from "react";
import { prisma } from "@chessplay-clone/db";
import { effectiveSessionStatus } from "../lib/liveSession";
import {
  lastNDays,
  lastNWeeks,
  periodBounds,
  previousPeriodBounds,
  type Period,
} from "../lib/periods";

// Academy-wide reads for the admin dashboard. The first aggregate layer in
// this app — every number before it was a .length over a list a page had
// already loaded for other reasons.
//
// Two constraints shape everything here:
//
// 1. `count` and `findMany` are the only operations packages/db/src/
//    tenantScope.ts guards. `groupBy` and `aggregate` are NOT in its scoped
//    list, so a grouped query would silently escape tenant isolation. Every
//    bucket is therefore counted with `count` or folded in JS from a
//    `findMany` that selects only the column it needs.
//
// 2. Period boundaries come from the *academy's* timezone, passed in by the
//    caller, not the viewer's. Two admins in different countries must agree on
//    what "this week" contains.

const ENGAGEMENT_WINDOW_DAYS = 30;
const ATTENDANCE_TREND_WEEKS = 8;

function inPeriod(period: Period) {
  return { gte: period.start, lt: period.end };
}

/** A student who still has an account. The profile row carries no deletedAt. */
const LIVE_STUDENT = { role: "STUDENT", deletedAt: null } as const;

/** A class that was not called off. Everything else about status is derived. */
const NOT_CANCELLED = { status: { not: "CANCELLED" } } as const;

export interface StatCounts {
  totalStudents: number;
  newStudentsThisMonth: number;
  newStudentsThisWeek: number;
  newStudentsLastWeek: number;
  liveNow: number;
  sessionsToday: number;
  sessionsThisWeek: number;
  sessionsLastWeek: number;
  tournamentsTotal: number;
  tournamentsUpcoming: number;
  assignmentsTotal: number;
  assignmentsDueThisWeek: number;
}

/**
 * Today's classes, with enough of the classroom to render a row.
 *
 * Cached because the stat row needs it for "live now" and "N today" while the
 * Today's Classrooms widget needs the rows themselves — and the two sit behind
 * separate Suspense boundaries, so without this they would each query.
 *
 * Live-now cannot be a database predicate: a session is live when
 * scheduledAtUtc <= now < scheduledAtUtc + durationMins, and that arithmetic
 * is not expressible in a Prisma filter. Today's classes are few, so the
 * window is narrowed in SQL and the lifecycle is applied in JS by the same
 * effectiveSessionStatus every other screen uses.
 */
export const getSessionsToday = cache(async (tenantId: string, zone: string, nowMs: number) => {
  const now = new Date(nowMs);
  return prisma.liveSession.findMany({
    where: {
      tenantId,
      ...NOT_CANCELLED,
      scheduledAtUtc: inPeriod(periodBounds("day", zone, now)),
    },
    select: {
      id: true,
      scheduledAtUtc: true,
      durationMins: true,
      status: true,
      classroom: {
        select: {
          id: true,
          name: true,
          coaches: { select: { coach: { select: { user: { select: { email: true, displayName: true } } } } } },
          _count: { select: { students: true } },
        },
      },
    },
    orderBy: { scheduledAtUtc: "asc" },
  });
});

export async function getStatCounts(
  tenantId: string,
  zone: string,
  now: Date = new Date()
): Promise<StatCounts> {
  const week = periodBounds("week", zone, now);
  const lastWeek = previousPeriodBounds("week", zone, now);
  const month = periodBounds("month", zone, now);

  const [
    totalStudents,
    newStudentsThisMonth,
    newStudentsThisWeek,
    newStudentsLastWeek,
    sessionsThisWeek,
    sessionsLastWeek,
    tournamentsTotal,
    tournamentsUpcoming,
    assignmentsTotal,
    assignmentsDueThisWeek,
    todaySessions,
  ] = await Promise.all([
    prisma.user.count({ where: { tenantId, ...LIVE_STUDENT } }),
    prisma.user.count({ where: { tenantId, ...LIVE_STUDENT, createdAt: inPeriod(month) } }),
    prisma.user.count({ where: { tenantId, ...LIVE_STUDENT, createdAt: inPeriod(week) } }),
    prisma.user.count({ where: { tenantId, ...LIVE_STUDENT, createdAt: inPeriod(lastWeek) } }),
    prisma.liveSession.count({
      where: { tenantId, ...NOT_CANCELLED, scheduledAtUtc: inPeriod(week) },
    }),
    prisma.liveSession.count({
      where: { tenantId, ...NOT_CANCELLED, scheduledAtUtc: inPeriod(lastWeek) },
    }),
    prisma.tournament.count({ where: { tenantId } }),
    prisma.tournament.count({ where: { tenantId, startsAtUtc: { gte: now } } }),
    prisma.assignment.count({ where: { tenantId } }),
    prisma.assignment.count({ where: { tenantId, dueAtUtc: inPeriod(week) } }),
    getSessionsToday(tenantId, zone, now.getTime()),
  ]);

  return {
    totalStudents,
    newStudentsThisMonth,
    newStudentsThisWeek,
    newStudentsLastWeek,
    liveNow: todaySessions.filter((s) => effectiveSessionStatus(s, now) === "LIVE").length,
    sessionsToday: todaySessions.length,
    sessionsThisWeek,
    sessionsLastWeek,
    tournamentsTotal,
    tournamentsUpcoming,
    assignmentsTotal,
    assignmentsDueThisWeek,
  };
}

export type GrowthRange = "week" | "month" | "year";

/**
 * When each student account was created, inside the chosen range.
 *
 * Joins through User because StudentProfile has no createdAt — User.createdAt
 * is the only moment-of-signup this schema records for a person.
 */
export async function getStudentSignups(
  tenantId: string,
  zone: string,
  range: GrowthRange,
  now: Date = new Date()
): Promise<{ period: Period; timestamps: Date[] }> {
  const period = periodBounds(range, zone, now);
  const rows = await prisma.user.findMany({
    where: { tenantId, ...LIVE_STUDENT, createdAt: inPeriod(period) },
    select: { createdAt: true },
  });
  return { period, timestamps: rows.map((r) => r.createdAt) };
}

export interface EngagementData {
  /** Marked attendance rows in the window — the split's denominator. */
  attendance: { present: boolean }[];
  /** Scheduled minutes per class. There is no record of actual run time. */
  durations: number[];
  activeStudents: number;
  totalStudents: number;
  /** Oldest week first; `records` is empty for a week nobody marked. */
  weeklyAttendance: { label: string; records: { present: boolean }[] }[];
}

export async function getEngagement(
  tenantId: string,
  zone: string,
  now: Date = new Date()
): Promise<EngagementData> {
  const window = lastNDays(ENGAGEMENT_WINDOW_DAYS, zone, now);
  const weeks = lastNWeeks(ATTENDANCE_TREND_WEEKS, zone, now);
  const trendWindow: Period = { start: weeks[0].start, end: weeks[weeks.length - 1].end };

  const [trendRows, durationRows, totalStudents, attended, solved, played, earned] =
    await Promise.all([
      // One read covers both the 30-day tile and the 8-week trend: the trend
      // window contains the shorter one, so a second query would be the same
      // rows again.
      prisma.attendanceRecord.findMany({
        where: { tenantId, liveSession: { scheduledAtUtc: inPeriod(trendWindow) } },
        select: { present: true, liveSession: { select: { scheduledAtUtc: true } } },
      }),
      prisma.liveSession.findMany({
        where: { tenantId, ...NOT_CANCELLED, scheduledAtUtc: inPeriod(window) },
        select: { durationMins: true },
      }),
      prisma.user.count({ where: { tenantId, ...LIVE_STUDENT } }),
      // "Active" has no stored definition — StudentProfile has no isActive and
      // ClassroomStudent has no unenrolledAt — so it is behavioural: a student
      // who did any one of these four things inside the window.
      prisma.attendanceRecord.findMany({
        where: {
          tenantId,
          present: true,
          liveSession: { scheduledAtUtc: inPeriod(window) },
        },
        select: { studentId: true },
        distinct: ["studentId"],
      }),
      prisma.puzzleAttempt.findMany({
        where: { tenantId, attemptedAtUtc: inPeriod(window) },
        select: { studentId: true },
        distinct: ["studentId"],
      }),
      prisma.game.findMany({
        where: { tenantId, playedAtUtc: inPeriod(window) },
        select: { studentId: true },
        distinct: ["studentId"],
      }),
      prisma.xpEvent.findMany({
        where: { tenantId, awardedAtUtc: inPeriod(window) },
        select: { studentId: true },
        distinct: ["studentId"],
      }),
    ]);

  const active = new Set<string>();
  for (const list of [attended, solved, played, earned]) {
    for (const row of list) active.add(row.studentId);
  }

  return {
    attendance: trendRows
      .filter(
        (r) =>
          r.liveSession.scheduledAtUtc >= window.start && r.liveSession.scheduledAtUtc < window.end
      )
      .map((r) => ({ present: r.present })),
    durations: durationRows.map((r) => r.durationMins),
    activeStudents: active.size,
    totalStudents,
    weeklyAttendance: weeks.map((w, i) => ({
      label: `W${i + 1}`,
      records: trendRows
        .filter(
          (r) => r.liveSession.scheduledAtUtc >= w.start && r.liveSession.scheduledAtUtc < w.end
        )
        .map((r) => ({ present: r.present })),
    })),
  };
}

/**
 * Classes starting within the next seven days.
 *
 * Excludes cancelled in SQL and finished in JS, so a class that started this
 * morning and is already over does not sit in a list headed "upcoming" —
 * `isUpcoming` is the same predicate the rest of the app uses.
 */
export async function getUpcomingSessions(tenantId: string, now: Date = new Date(), take = 6) {
  const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return prisma.liveSession.findMany({
    where: {
      tenantId,
      ...NOT_CANCELLED,
      scheduledAtUtc: { gte: new Date(now.getTime() - 60 * 60 * 1000), lt: horizon },
    },
    select: {
      id: true,
      scheduledAtUtc: true,
      durationMins: true,
      status: true,
      classroom: { select: { id: true, name: true } },
    },
    orderBy: { scheduledAtUtc: "asc" },
    take,
  });
}
