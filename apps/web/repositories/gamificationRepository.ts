import { prisma, type XpEventKind } from "@chessplay-clone/db";
import { XP_POINTS, badgesEarnedAt } from "../lib/gamification/rules";
import { rankLeaderboard } from "../lib/gamification/leaderboard";
import { displayName } from "../lib/displayName";

/**
 * Awards XP for one thing that happened, and any badge it unlocks.
 *
 * Idempotent by construction: `@@unique([studentId, kind, sourceId])` plus
 * `skipDuplicates` means re-submitting the same puzzle attempt, or a coach
 * re-marking the same attendance row, pays out once. Without that, a student
 * could farm XP by re-submitting a solved puzzle.
 *
 * Deliberately never throws into its caller (see awardXpSafely): XP is a
 * garnish on top of the action that earned it, and a gamification failure
 * must not roll back a recorded puzzle attempt or attendance mark.
 */
export async function awardXp(input: {
  tenantId: string;
  studentId: string;
  kind: XpEventKind;
  sourceId: string;
}): Promise<{ awarded: boolean }> {
  const created = await prisma.xpEvent.createMany({
    data: [
      {
        tenantId: input.tenantId,
        studentId: input.studentId,
        kind: input.kind,
        points: XP_POINTS[input.kind],
        sourceId: input.sourceId,
      },
    ],
    skipDuplicates: true,
  });

  // Nothing new happened, so nothing new can have been unlocked.
  if (created.count === 0) return { awarded: false };

  await grantEarnedBadges(input.tenantId, input.studentId);
  return { awarded: true };
}

/** Same contract, but swallows failures — see awardXp's note. */
export async function awardXpSafely(input: {
  tenantId: string;
  studentId: string;
  kind: XpEventKind;
  sourceId: string;
}): Promise<void> {
  try {
    await awardXp(input);
  } catch (error) {
    // Logged rather than surfaced: the student's puzzle attempt is already
    // saved, and telling them "your solve did not count" would be worse than
    // quietly missing 10 points.
    console.error("[gamification] failed to award XP", error);
  }
}

async function grantEarnedBadges(tenantId: string, studentId: string) {
  const counts = await countEventsByKind(tenantId, studentId);
  const earned = badgesEarnedAt(counts);
  if (earned.length === 0) return;

  await prisma.studentBadge.createMany({
    data: earned.map((badge) => ({ tenantId, studentId, code: badge.code })),
    // The unique on [studentId, code] is what makes re-granting a no-op, so
    // this can simply assert the full earned set every time.
    skipDuplicates: true,
  });
}

export async function countEventsByKind(
  tenantId: string,
  studentId: string
): Promise<Record<XpEventKind, number>> {
  const events = await prisma.xpEvent.findMany({
    where: { tenantId, studentId },
    select: { kind: true },
  });

  // Counted in JS rather than with groupBy: tenantScope guards findMany but
  // not aggregates, and a student has hundreds of these, not millions.
  const counts: Record<XpEventKind, number> = { PUZZLE_SOLVED: 0, SESSION_ATTENDED: 0 };
  for (const event of events) counts[event.kind] += 1;
  return counts;
}

export async function getStudentProgress(tenantId: string, studentId: string) {
  const [events, badges] = await Promise.all([
    prisma.xpEvent.findMany({
      where: { tenantId, studentId },
      select: { kind: true, points: true },
    }),
    prisma.studentBadge.findMany({
      where: { tenantId, studentId },
      orderBy: { earnedAtUtc: "desc" },
    }),
  ]);

  return {
    xp: events.reduce((sum, event) => sum + event.points, 0),
    puzzlesSolved: events.filter((e) => e.kind === "PUZZLE_SOLVED").length,
    classesAttended: events.filter((e) => e.kind === "SESSION_ATTENDED").length,
    badges,
  };
}

/**
 * The leaderboard for one classroom.
 *
 * Classroom-scoped on purpose (claude.md §9): there is no academy-wide or
 * public ranking anywhere in this product, only standings among people who
 * already train together.
 *
 * `period` limits XP to events awarded inside it (the Leaderboard page's
 * Daily/Weekly/Monthly tabs); omitted, it is all-time. Badges are always
 * all-time — a badge is earned once, not per week.
 */
export async function getClassroomLeaderboard(
  tenantId: string,
  classroomId: string,
  period?: { start: Date; end: Date }
) {
  const enrolments = await prisma.classroomStudent.findMany({
    where: { tenantId, classroomId },
    include: { student: { include: { user: true } } },
  });
  if (enrolments.length === 0) return [];

  const studentIds = enrolments.map((e) => e.studentId);
  const [events, badges] = await Promise.all([
    prisma.xpEvent.findMany({
      where: {
        tenantId,
        studentId: { in: studentIds },
        ...(period ? { awardedAtUtc: { gte: period.start, lt: period.end } } : {}),
      },
      select: { studentId: true, points: true, kind: true },
    }),
    prisma.studentBadge.findMany({
      where: { tenantId, studentId: { in: studentIds } },
      select: { studentId: true },
    }),
  ]);

  const totals = new Map<string, { xp: number; puzzlesSolved: number; classesAttended: number }>();
  for (const event of events) {
    const t = totals.get(event.studentId) ?? { xp: 0, puzzlesSolved: 0, classesAttended: 0 };
    t.xp += event.points;
    if (event.kind === "PUZZLE_SOLVED") t.puzzlesSolved += 1;
    if (event.kind === "SESSION_ATTENDED") t.classesAttended += 1;
    totals.set(event.studentId, t);
  }
  const badgeCount = new Map<string, number>();
  for (const b of badges) badgeCount.set(b.studentId, (badgeCount.get(b.studentId) ?? 0) + 1);

  return rankLeaderboard(
    enrolments.map((enrolment) => ({
      studentId: enrolment.studentId,
      user: enrolment.student.user,
      xp: 0,
      puzzlesSolved: 0,
      classesAttended: 0,
      ...totals.get(enrolment.studentId),
      badges: badgeCount.get(enrolment.studentId) ?? 0,
    })),
    (row) => displayName(row.user)
  );
}
