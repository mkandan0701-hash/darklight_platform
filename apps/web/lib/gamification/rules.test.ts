import { describe, expect, it } from "vitest";
import { BADGES, badgesEarnedAt, findBadge, totalXp, XP_POINTS } from "./rules";

describe("XP_POINTS", () => {
  it("values attendance above a single puzzle — turning up is the habit", () => {
    expect(XP_POINTS.SESSION_ATTENDED).toBeGreaterThan(XP_POINTS.PUZZLE_SOLVED);
  });
});

describe("totalXp", () => {
  it("prices each event kind at its own rate", () => {
    expect(totalXp({ PUZZLE_SOLVED: 3, SESSION_ATTENDED: 2 })).toBe(
      3 * XP_POINTS.PUZZLE_SOLVED + 2 * XP_POINTS.SESSION_ATTENDED
    );
  });

  it("is zero for a student who has done nothing yet", () => {
    expect(totalXp({ PUZZLE_SOLVED: 0, SESSION_ATTENDED: 0 })).toBe(0);
  });
});

describe("badgesEarnedAt", () => {
  it("awards nothing at zero", () => {
    expect(badgesEarnedAt({ PUZZLE_SOLVED: 0, SESSION_ATTENDED: 0 })).toEqual([]);
  });

  it("awards the first-solve badge on the first puzzle", () => {
    const earned = badgesEarnedAt({ PUZZLE_SOLVED: 1, SESSION_ATTENDED: 0 });
    expect(earned.map((b) => b.code)).toEqual(["FIRST_PUZZLE"]);
  });

  // Cumulative rather than exclusive: a student arriving at 50 still holds the
  // 10 and the first, which is what the badge shelf on their page shows.
  it("keeps every lower badge as thresholds are passed", () => {
    const earned = badgesEarnedAt({ PUZZLE_SOLVED: 50, SESSION_ATTENDED: 0 });
    expect(earned.map((b) => b.code)).toEqual(["FIRST_PUZZLE", "PUZZLE_10", "PUZZLE_50"]);
  });

  it("keeps the two tracks independent", () => {
    const earned = badgesEarnedAt({ PUZZLE_SOLVED: 0, SESSION_ATTENDED: 10 });
    expect(earned.map((b) => b.code)).toEqual(["FIRST_CLASS", "ATTEND_10"]);
  });

  it("awards exactly at the threshold, not one past it", () => {
    expect(
      badgesEarnedAt({ PUZZLE_SOLVED: 9, SESSION_ATTENDED: 0 }).map((b) => b.code)
    ).not.toContain("PUZZLE_10");
    expect(
      badgesEarnedAt({ PUZZLE_SOLVED: 10, SESSION_ATTENDED: 0 }).map((b) => b.code)
    ).toContain("PUZZLE_10");
  });
});

describe("badge catalogue", () => {
  it("has no duplicate codes — the code is the unique key in the database", () => {
    expect(new Set(BADGES.map((b) => b.code)).size).toBe(BADGES.length);
  });

  it("looks a badge up by code, and reports an unknown one as missing", () => {
    expect(findBadge("PUZZLE_10")?.label).toBe("Ten solved");
    expect(findBadge("NOT_A_BADGE")).toBeUndefined();
  });
});
