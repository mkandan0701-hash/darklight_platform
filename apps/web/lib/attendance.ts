// Attendance maths, kept out of the repository and the components so the
// rules that decide what counts as an absence can be tested directly. They
// are invisible in the UI until real data accumulates, which is exactly how a
// report ships looking fine and is quietly wrong for a term.

export type AttendanceStatus = "present" | "absent" | "unmarked";

export function resolveStatus(record?: { present: boolean }): AttendanceStatus {
  if (!record) return "unmarked";
  return record.present ? "present" : "absent";
}

/**
 * Percentage attended, or null when there is nothing to divide by.
 * A student with no sessions yet has *no* rate — rendering that as 0% would
 * accuse a brand-new joiner of missing everything.
 */
export function attendanceRate(attended: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((attended / total) * 100);
}

export function formatAttendanceRate(attended: number, total: number): string {
  const rate = attendanceRate(attended, total);
  return rate === null ? "—" : `${rate}%`;
}

export type MarkedSession = { liveSessionId: string; scheduledAtUtc: Date };

/**
 * The denominator rules, in one place.
 *
 * `markedSessions` must contain only sessions that actually have attendance
 * records — a session the coach never marked is missing data, not an absence,
 * and a session in the future is neither.
 *
 * On top of that, a student who enrolled mid-term is not absent from classes
 * held before they joined, so the denominator is per-student rather than
 * per-classroom. The numerator is filtered the same way, so a stray record
 * predating enrolment can't push anyone over 100%.
 */
export function countAttendance(params: {
  enrolledAt: Date;
  markedSessions: MarkedSession[];
  presentSessionIds: ReadonlySet<string>;
}): { attendedCount: number; sessionCount: number } {
  const eligible = eligibleSessions(params);
  return {
    sessionCount: eligible.length,
    attendedCount: eligible.filter((s) => s.present).length,
  };
}

export type EligibleSession = MarkedSession & { present: boolean };

/**
 * The sessions that count for one student, newest first.
 *
 * This is `countAttendance`'s numerator and denominator before they collapse
 * into two integers — the rows a parent reads down, resolved by exactly the
 * rules the summary above is computed from. Two implementations of "which
 * sessions count" would eventually disagree, and the way a parent finds out is
 * a percentage that doesn't match the list under it.
 */
export function eligibleSessions(params: {
  enrolledAt: Date;
  markedSessions: MarkedSession[];
  presentSessionIds: ReadonlySet<string>;
}): EligibleSession[] {
  return params.markedSessions
    .filter((s) => s.scheduledAtUtc.getTime() >= params.enrolledAt.getTime())
    .map((s) => ({ ...s, present: params.presentSessionIds.has(s.liveSessionId) }))
    .sort((a, b) => b.scheduledAtUtc.getTime() - a.scheduledAtUtc.getTime());
}
