// Server-authoritative scoring of a submitted puzzle attempt. Never trust a
// client-sent `isCorrect` flag — the client only ever supplies the moves it
// played, and this compares them against the puzzle's real stored solution
// (already validated as legal at import time, see parsePgnPuzzles.ts's
// isValidPuzzle / lichessPuzzleImport.ts's applySetupMove), so this is a
// plain positional comparison, not a re-legality-check.

export interface ScoreAttemptInput {
  /** Puzzle.moves — space-separated UCI solution, e.g. "e2e4 e7e5". */
  solutionMoves: string;
  /** UCI moves the student actually played, in order. */
  submittedMoves: string[];
}

export interface ScoreAttemptResult {
  isCorrect: boolean;
  /** Index of the first move where submittedMoves diverges from the solution, or -1 if none did. */
  firstMismatchIndex: number;
}

export function scorePuzzleAttempt(input: ScoreAttemptInput): ScoreAttemptResult {
  const solution = input.solutionMoves.split(" ").filter(Boolean);

  for (let i = 0; i < Math.min(solution.length, input.submittedMoves.length); i++) {
    if (input.submittedMoves[i] !== solution[i]) {
      return { isCorrect: false, firstMismatchIndex: i };
    }
  }

  if (input.submittedMoves.length !== solution.length) {
    return { isCorrect: false, firstMismatchIndex: Math.min(solution.length, input.submittedMoves.length) };
  }

  return { isCorrect: true, firstMismatchIndex: -1 };
}
