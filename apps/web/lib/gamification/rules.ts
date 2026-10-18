// What earns XP, and which badges that unlocks.
//
// Pure and I/O-free so the rules can be tested directly, and so changing what
// a puzzle is worth is a one-line edit rather than a hunt through actions.
//
// Scope note (claude.md §9): these are classroom-scoped progress markers, not
// a public ladder and not puzzle rush. Nothing here ranks a student against
// anyone outside the classroom they train in.

export type XpEventKind = "PUZZLE_SOLVED" | "SESSION_ATTENDED";

export const XP_POINTS: Record<XpEventKind, number> = {
  // A solved puzzle is the unit of practice this product is built around, so
  // it is the baseline everything else is priced against.
  PUZZLE_SOLVED: 10,
  // Turning up is worth more than one puzzle: attendance is the habit an
  // academy is actually trying to build, and the thing parents ask about.
  SESSION_ATTENDED: 25,
};

export interface BadgeDefinition {
  code: string;
  label: string;
  description: string;
  kind: XpEventKind;
  /** Count of that event kind at which the badge is earned. */
  threshold: number;
}

// Thresholds are counts of events, not XP totals: "solved 50 puzzles" is
// something a student can picture and work towards, where "500 XP" is not.
export const BADGES: BadgeDefinition[] = [
  {
    code: "FIRST_PUZZLE",
    label: "First solve",
    description: "Solved your first puzzle",
    kind: "PUZZLE_SOLVED",
    threshold: 1,
  },
  {
    code: "PUZZLE_10",
    label: "Ten solved",
    description: "Solved 10 puzzles",
    kind: "PUZZLE_SOLVED",
    threshold: 10,
  },
  {
    code: "PUZZLE_50",
    label: "Fifty solved",
    description: "Solved 50 puzzles",
    kind: "PUZZLE_SOLVED",
    threshold: 50,
  },
  {
    code: "PUZZLE_100",
    label: "Century",
    description: "Solved 100 puzzles",
    kind: "PUZZLE_SOLVED",
    threshold: 100,
  },
  {
    code: "FIRST_CLASS",
    label: "First class",
    description: "Attended your first class",
    kind: "SESSION_ATTENDED",
    threshold: 1,
  },
  {
    code: "ATTEND_10",
    label: "Regular",
    description: "Attended 10 classes",
    kind: "SESSION_ATTENDED",
    threshold: 10,
  },
  {
    code: "ATTEND_50",
    label: "Ever-present",
    description: "Attended 50 classes",
    kind: "SESSION_ATTENDED",
    threshold: 50,
  },
];

const BY_CODE = new Map(BADGES.map((badge) => [badge.code, badge]));

export function findBadge(code: string): BadgeDefinition | undefined {
  return BY_CODE.get(code);
}

/**
 * Every badge earned at the given event counts, including ones already held.
 *
 * Returning the full earned set rather than only the newly-crossed one keeps
 * this a pure function of the counts: deciding what is *new* needs to know
 * what the student already has, which is the caller's business (and a unique
 * constraint's).
 */
export function badgesEarnedAt(counts: Record<XpEventKind, number>): BadgeDefinition[] {
  return BADGES.filter((badge) => counts[badge.kind] >= badge.threshold);
}

/** Total XP for a set of counts. */
export function totalXp(counts: Record<XpEventKind, number>): number {
  return (Object.keys(XP_POINTS) as XpEventKind[]).reduce(
    (sum, kind) => sum + XP_POINTS[kind] * (counts[kind] ?? 0),
    0
  );
}
