// Pure half of schedule-conflict detection. The repository finds candidate
// rows (other classes sharing a coach or student, holidays, a coach's blocked
// time); this decides which of them actually overlap the proposed times and
// says so in words a coach can act on.

export type ConflictReason = "COACH" | "STUDENT" | "HOLIDAY" | "COACH_UNAVAILABLE";

export type ConflictCandidate = {
  reason: ConflictReason;
  /** Who or what clashes — "Coach Priya", "Arjun", "Diwali". */
  who: string;
  /** What it clashes with — the other class's name, or the block's title. */
  what: string;
  startUtc: Date;
  endUtc: Date;
};

export type ScheduleConflict = {
  reason: ConflictReason;
  message: string;
  /** The proposed occurrence that clashes. */
  occurrenceStartUtc: string;
  otherStartUtc: string;
  otherEndUtc: string;
};

/** Cap on what one save reports — enough to see the pattern, not a wall of text. */
export const MAX_REPORTED_CONFLICTS = 20;

/**
 * Half-open intervals: a class ending at 11:00 does not clash with one
 * starting at 11:00. Back-to-back is the normal shape of a coach's Saturday.
 */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export function matchConflicts(
  proposed: { startUtc: Date; endUtc: Date }[],
  candidates: ConflictCandidate[]
): ScheduleConflict[] {
  const out: ScheduleConflict[] = [];
  for (const occ of proposed) {
    for (const c of candidates) {
      if (!overlaps(occ.startUtc, occ.endUtc, c.startUtc, c.endUtc)) continue;
      out.push({
        reason: c.reason,
        message: describe(c),
        occurrenceStartUtc: occ.startUtc.toISOString(),
        otherStartUtc: c.startUtc.toISOString(),
        otherEndUtc: c.endUtc.toISOString(),
      });
      if (out.length >= MAX_REPORTED_CONFLICTS) return out;
    }
  }
  return out;
}

function describe(c: ConflictCandidate): string {
  switch (c.reason) {
    case "COACH":
      return `${c.who} is already teaching "${c.what}"`;
    case "STUDENT":
      return `${c.who} is already in "${c.what}"`;
    case "HOLIDAY":
      return `Academy holiday: ${c.what}`;
    case "COACH_UNAVAILABLE":
      return `${c.who} is unavailable (${c.what})`;
  }
}

/** One line for the audit row when an admin saves over a clash. */
export function summarizeConflicts(conflicts: ScheduleConflict[]): string {
  const unique = [...new Set(conflicts.map((c) => c.message))];
  const head = unique.slice(0, 5).join("; ");
  return unique.length > 5 ? `${head}; and ${unique.length - 5} more` : head;
}
