import { describe, expect, it } from "vitest";
import { scorePuzzleAttempt } from "./scorePuzzleAttempt";

const SOLUTION = "e6e7 b2b1 b3c1 b1c1 h6c1";

describe("scorePuzzleAttempt", () => {
  it("marks a full, exact solution as correct", () => {
    expect(
      scorePuzzleAttempt({ solutionMoves: SOLUTION, submittedMoves: SOLUTION.split(" ") })
    ).toEqual({ isCorrect: true, firstMismatchIndex: -1 });
  });

  it("marks a wrong first move as incorrect at index 0", () => {
    expect(
      scorePuzzleAttempt({ solutionMoves: SOLUTION, submittedMoves: ["a1a2"] })
    ).toEqual({ isCorrect: false, firstMismatchIndex: 0 });
  });

  it("marks a wrong move partway through as incorrect at that index", () => {
    const submitted = ["e6e7", "b2b1", "b3c1", "a1a1"];
    expect(scorePuzzleAttempt({ solutionMoves: SOLUTION, submittedMoves: submitted })).toEqual({
      isCorrect: false,
      firstMismatchIndex: 3,
    });
  });

  it("marks a too-short (in-progress) submission as incorrect, not a crash", () => {
    expect(
      scorePuzzleAttempt({ solutionMoves: SOLUTION, submittedMoves: ["e6e7", "b2b1"] })
    ).toEqual({ isCorrect: false, firstMismatchIndex: 2 });
  });

  it("marks a too-long submission as incorrect even if the prefix matches", () => {
    const submitted = [...SOLUTION.split(" "), "a1a2"];
    expect(scorePuzzleAttempt({ solutionMoves: SOLUTION, submittedMoves: submitted })).toEqual({
      isCorrect: false,
      firstMismatchIndex: 5,
    });
  });

  it("treats an empty submission as incorrect", () => {
    expect(scorePuzzleAttempt({ solutionMoves: SOLUTION, submittedMoves: [] })).toEqual({
      isCorrect: false,
      firstMismatchIndex: 0,
    });
  });
});
