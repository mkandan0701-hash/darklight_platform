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

/**
 * The same sessions countAttendance counts, each carrying whether the student
 * was there — the row-level view behind the summary.
 *
 * countAttendance is defined in terms of this rather than repeating the
 * filter, which is the whole point: a parent reading five absences off the
 * detail list and 90% off the summary card would be looking at a bug, and two
 * independent filters is how that bug arrives. Derive one from the other and
 * they cannot disagree.
 *
 * `present: false` covers both "marked absent" and "not marked at all for a
 * session the class was marked for" — countAttendance has always treated
 * those the same way, and splitting them here would change the numbers.
 * Newest first: the last lesson is the one anybody asks about.
 */
export function eligibleSessions(params: {
  enrolledAt: Date;
  markedSessions: MarkedSession[];
  presentSessionIds: ReadonlySet<string>;
}): Array<MarkedSession & { present: boolean }> {
  return params.markedSessions
    .filter((s) => s.scheduledAtUtc.getTime() >= params.enrolledAt.getTime())
    .map((s) => ({ ...s, present: params.presentSessionIds.has(s.liveSessionId) }))
    .sort((a, b) => b.scheduledAtUtc.getTime() - a.scheduledAtUtc.getTime());
}
