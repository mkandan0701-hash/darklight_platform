// Turning XP totals into a ranked classroom board. Pure, so the tie and
// zero-XP rules are tested without a database.
//
// Scope note (claude.md §9): input is always one classroom's roster — this
// ranks classmates, never an academy or the public.

export type LeaderboardInput = {
  studentId: string;
  xp: number;
  puzzlesSolved: number;
  classesAttended: number;
  badges: number;
};

export type LeaderboardRow = LeaderboardInput & {
  /**
   * Dense rank: two students on 120 XP are both 1st and the next is 2nd.
   * Null for 0 XP — nobody "wins" 4th place by not having started.
   */
  rank: number | null;
};

export function rankLeaderboard<T extends LeaderboardInput>(
  rows: T[],
  nameOf: (row: T) => string
): (T & { rank: number | null })[] {
  const sorted = [...rows].sort((a, b) => b.xp - a.xp || nameOf(a).localeCompare(nameOf(b)));
  let rank = 0;
  let lastXp: number | null = null;
  return sorted.map((row) => {
    if (row.xp <= 0) return { ...row, rank: null };
    if (row.xp !== lastXp) {
      rank += 1;
      lastXp = row.xp;
    }
    return { ...row, rank };
  });
}
