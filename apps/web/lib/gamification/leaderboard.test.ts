import { describe, expect, it } from "vitest";
import { rankLeaderboard, type LeaderboardInput } from "./leaderboard";

const row = (studentId: string, xp: number): LeaderboardInput & { name: string } => ({
  studentId,
  name: studentId,
  xp,
  puzzlesSolved: 0,
  classesAttended: 0,
  badges: 0,
});

describe("rankLeaderboard", () => {
  it("ranks highest first with dense ties", () => {
    const out = rankLeaderboard([row("c", 50), row("a", 120), row("b", 120), row("d", 10)], (r) => r.name);
    expect(out.map((r) => [r.studentId, r.rank])).toEqual([
      ["a", 1],
      ["b", 1],
      ["c", 2],
      ["d", 3],
    ]);
  });

  it("lists students with no XP last, unranked", () => {
    const out = rankLeaderboard([row("z", 0), row("y", 25), row("x", 0)], (r) => r.name);
    expect(out.map((r) => [r.studentId, r.rank])).toEqual([
      ["y", 1],
      ["x", null],
      ["z", null],
    ]);
  });

  it("handles an empty roster", () => {
    expect(rankLeaderboard([], () => "")).toEqual([]);
  });
});
