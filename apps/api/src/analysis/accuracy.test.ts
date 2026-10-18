import { describe, expect, it } from "vitest";
import { averageAccuracy, classifyLoss, moveAccuracy, winPercent } from "./accuracy";

describe("classifyLoss", () => {
  it("applies the conventional centipawn thresholds", () => {
    expect(classifyLoss(0)).toBe("ok");
    expect(classifyLoss(49)).toBe("ok");
    expect(classifyLoss(50)).toBe("inaccuracy");
    expect(classifyLoss(99)).toBe("inaccuracy");
    expect(classifyLoss(100)).toBe("mistake");
    expect(classifyLoss(299)).toBe("mistake");
    expect(classifyLoss(300)).toBe("blunder");
    expect(classifyLoss(5000)).toBe("blunder");
  });

  // A move that *improves* the evaluation must never be graded as an error —
  // engine noise between depths can make a loss come out slightly negative.
  it("treats a negative loss as fine, not as an error", () => {
    expect(classifyLoss(-120)).toBe("ok");
  });
});

describe("winPercent", () => {
  it("is 50% at a dead level position", () => {
    expect(winPercent(0)).toBeCloseTo(50, 6);
  });

  it("is symmetric about zero", () => {
    expect(winPercent(300) + winPercent(-300)).toBeCloseTo(100, 6);
  });

  it("saturates rather than exceeding the bounds", () => {
    expect(winPercent(100_000)).toBeLessThanOrEqual(100);
    expect(winPercent(-100_000)).toBeGreaterThanOrEqual(0);
  });
});

describe("moveAccuracy", () => {
  it("scores a move that loses nothing at (or near) 100", () => {
    expect(moveAccuracy(50, 50)).toBeGreaterThan(99);
  });

  it("scores a move that throws the game away near 0", () => {
    expect(moveAccuracy(95, 5)).toBeLessThan(5);
  });

  // The point of scoring in win-probability space rather than centipawns: the
  // same nominal slip matters far less when the game is already decided.
  it("punishes a slip in a level position more than the same slip when winning", () => {
    const level = moveAccuracy(winPercent(0), winPercent(-200));
    const winning = moveAccuracy(winPercent(900), winPercent(700));
    expect(level).toBeLessThan(winning);
  });

  it("never reports outside 0-100", () => {
    expect(moveAccuracy(100, 0)).toBeGreaterThanOrEqual(0);
    expect(moveAccuracy(0, 100)).toBeLessThanOrEqual(100);
  });
});

describe("averageAccuracy", () => {
  it("averages to one decimal place", () => {
    expect(averageAccuracy([100, 95, 90])).toBe(95);
    expect(averageAccuracy([100, 99])).toBe(99.5);
  });

  // A side that never moved has no accuracy — reporting 0 would read as
  // "played terribly" rather than "no data".
  it("returns null for a side with no moves", () => {
    expect(averageAccuracy([])).toBeNull();
  });
});
