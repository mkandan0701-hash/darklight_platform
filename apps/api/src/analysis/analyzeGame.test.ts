import { describe, expect, it } from "vitest";
import { analyzeGame, resolveStudentColor } from "./analyzeGame";
import type { Engine } from "./stockfishEngine";
import { MATE_SCORE } from "./uci";

// Scholar's mate: White wins in 4. Black's 3...Nf6?? allows mate next move.
const SCHOLARS_MATE =
  '[Event "Test"]\n[White "asha"]\n[Black "rival"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0';

/**
 * Engine stub scripted with White-POV evaluations, one per position in
 * visit order (starting position first).
 *
 * It converts each into the side-to-move frame a real engine reports in, so
 * the POV conversion in analyzeGame is genuinely exercised rather than
 * bypassed — scripting raw side-to-move numbers instead would let a sign bug
 * pass by cancelling itself out.
 */
function scriptedEngine(whitePovScores: (number | null)[]): Engine & { calls: string[] } {
  let i = 0;
  const calls: string[] = [];
  return {
    calls,
    async evaluate(fen: string) {
      calls.push(fen);
      const whitePov = whitePovScores[Math.min(i, whitePovScores.length - 1)];
      i += 1;
      if (whitePov === null) return null;
      const blackToMove = fen.split(" ")[1] === "b";
      return { cp: blackToMove ? -whitePov : whitePov, depth: 12, mate: false };
    },
    async quit() {},
  };
}

describe("analyzeGame", () => {
  it("evaluates the start position plus every resulting position", async () => {
    const engine = scriptedEngine([0]);
    const result = await analyzeGame(SCHOLARS_MATE, engine);
    // 7 moves in the game, plus the initial position.
    expect(engine.calls).toHaveLength(8);
    expect(result.movesAnalyzed).toBe(7);
  });

  it("reports the depth it ran at", async () => {
    const result = await analyzeGame(SCHOLARS_MATE, scriptedEngine([0]), { depth: 18 });
    expect(result.engineDepth).toBe(18);
  });

  // The sign bug this pins: engine scores are relative to the side to move,
  // so comparing them raw flips every ply and grades a clean game as a
  // catastrophe for both players.
  it("does not invent losses in a game where the evaluation never moves", async () => {
    const result = await analyzeGame(SCHOLARS_MATE, scriptedEngine([0]));
    expect(result.mistakes).toEqual([]);
    expect(result.accuracyWhite).toBe(100);
    expect(result.accuracyBlack).toBe(100);
  });

  it("attributes a blunder to the side that actually played it", async () => {
    // Even plies are after White's move, odd after Black's. Level until
    // Black's 3rd move (ply 6), which hands White +900 — in White's frame a
    // rise, in Black's frame a 900cp loss.
    const engine = scriptedEngine([0, 0, 0, 0, 0, 0, 900, 900]);
    const result = await analyzeGame(SCHOLARS_MATE, engine);

    const blunders = result.mistakes.filter((m) => m.severity === "blunder");
    expect(blunders).toHaveLength(1);
    expect(blunders[0]).toMatchObject({ color: "b", san: "Nf6", ply: 6, moveNumber: 3 });
    expect(blunders[0].centipawnLoss).toBe(900);
    // Only Black erred, so only Black's accuracy should suffer.
    expect(result.accuracyBlack!).toBeLessThan(result.accuracyWhite!);
  });

  it("skips a ply the engine declined to score rather than inventing a number", async () => {
    const engine = scriptedEngine([0, null, 0, 0, 0, 0, 0, 0]);
    const result = await analyzeGame(SCHOLARS_MATE, engine);
    // The two comparisons touching the unscored position are dropped.
    expect(result.movesAnalyzed).toBe(5);
    expect(result.mistakes).toEqual([]);
  });

  it("handles a mate score without overflowing into nonsense", async () => {
    const engine = scriptedEngine([0, 0, 0, 0, 0, 0, MATE_SCORE, MATE_SCORE]);
    const result = await analyzeGame(SCHOLARS_MATE, engine);
    expect(result.accuracyWhite).toBeGreaterThanOrEqual(0);
    expect(result.accuracyWhite).toBeLessThanOrEqual(100);
    expect(result.mistakes.every((m) => Number.isFinite(m.centipawnLoss))).toBe(true);
  });

  it("returns an empty analysis for a PGN with no moves", async () => {
    const result = await analyzeGame('[Event "Empty"]\n\n*', scriptedEngine([0]));
    expect(result.movesAnalyzed).toBe(0);
    expect(result.accuracyWhite).toBeNull();
    expect(result.accuracyBlack).toBeNull();
  });
});

describe("resolveStudentColor", () => {
  it("matches the student's handle against the PGN name tags", () => {
    expect(resolveStudentColor(SCHOLARS_MATE, ["asha"])).toBe("w");
    expect(resolveStudentColor(SCHOLARS_MATE, ["rival"])).toBe("b");
  });

  it("ignores case and surrounding whitespace", () => {
    expect(resolveStudentColor(SCHOLARS_MATE, ["  ASHA "])).toBe("w");
  });

  // Attributing the game to the wrong side would put someone else's blunders
  // on a student's record; a null accuracy is the honest answer.
  it("returns null when no handle matches either player", () => {
    expect(resolveStudentColor(SCHOLARS_MATE, ["someone-else"])).toBeNull();
  });

  it("returns null when the student has no handles on file", () => {
    expect(resolveStudentColor(SCHOLARS_MATE, [null, undefined, "  "])).toBeNull();
  });
});
