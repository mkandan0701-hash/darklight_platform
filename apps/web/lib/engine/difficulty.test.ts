import { describe, expect, it } from "vitest";
import {
  DEFAULT_ENGINE_LEVEL_ID,
  ENGINE_LEVELS,
  budgetMsForLevel,
  getEngineLevel,
  goCommandForLevel,
  isEngineLevelId,
  optionCommandsForLevel,
} from "./difficulty";

describe("optionCommandsForLevel", () => {
  // The regression this file exists for. A UCI engine keeps options until told
  // otherwise, and UCI_LimitStrength overrides Skill Level. Emitting only the
  // options a level "needs" means switching L5 (Elo 2000) down to L1 leaves
  // limit-strength on, and the whole "Learning" game is played at 2000.
  it("always emits both Skill Level and UCI_LimitStrength, for every level", () => {
    for (const level of ENGINE_LEVELS) {
      const commands = optionCommandsForLevel(level.id);

      expect(
        commands.some((c) => c.startsWith("setoption name Skill Level value ")),
        `${level.id} must set Skill Level`
      ).toBe(true);
      expect(
        commands.some((c) => c.startsWith("setoption name UCI_LimitStrength value ")),
        `${level.id} must set UCI_LimitStrength`
      ).toBe(true);
    }
  });

  it("explicitly turns UCI_LimitStrength off on the skill-based levels", () => {
    for (const level of ENGINE_LEVELS.filter((l) => !l.limitStrength)) {
      expect(optionCommandsForLevel(level.id)).toContain(
        "setoption name UCI_LimitStrength value false"
      );
    }
  });

  it("sets UCI_Elo only on the levels that limit strength", () => {
    for (const level of ENGINE_LEVELS) {
      const hasElo = optionCommandsForLevel(level.id).some((c) =>
        c.startsWith("setoption name UCI_Elo value ")
      );
      expect(hasElo, `${level.id}`).toBe(level.limitStrength);
    }
  });

  it("produces the expected commands for a skill-based level", () => {
    expect(optionCommandsForLevel("l1")).toEqual([
      "setoption name Skill Level value 0",
      "setoption name UCI_LimitStrength value false",
    ]);
  });

  it("produces the expected commands for an Elo-limited level", () => {
    expect(optionCommandsForLevel("l5")).toEqual([
      "setoption name Skill Level value 16",
      "setoption name UCI_LimitStrength value true",
      "setoption name UCI_Elo value 2000",
    ]);
  });
});

describe("level definitions", () => {
  it("keeps every UCI_Elo inside the range this build accepts", () => {
    // Stockfish rejects UCI_Elo outside 1320-3190; an out-of-range setoption
    // is silently ignored, leaving the previous strength in place.
    for (const level of ENGINE_LEVELS) {
      if (level.uciElo === null) continue;
      expect(level.uciElo, level.id).toBeGreaterThanOrEqual(1320);
      expect(level.uciElo, level.id).toBeLessThanOrEqual(3190);
    }
  });

  it("keeps every Skill Level inside 0-20", () => {
    for (const level of ENGINE_LEVELS) {
      expect(level.skillLevel, level.id).toBeGreaterThanOrEqual(0);
      expect(level.skillLevel, level.id).toBeLessThanOrEqual(20);
    }
  });

  it("gets monotonically stronger", () => {
    const strength = ENGINE_LEVELS.map((l) => (l.limitStrength ? l.uciElo! : l.skillLevel));
    // Skill-based and Elo-based levels aren't directly comparable, so compare
    // within each group.
    const skillBased = ENGINE_LEVELS.filter((l) => !l.limitStrength).map((l) => l.skillLevel);
    const eloBased = ENGINE_LEVELS.filter((l) => l.limitStrength).map((l) => l.uciElo!);

    expect(strength).toHaveLength(ENGINE_LEVELS.length);
    expect([...skillBased].sort((a, b) => a - b)).toEqual(skillBased);
    expect([...eloBased].sort((a, b) => a - b)).toEqual(eloBased);
  });

  it("has unique ids and a valid default", () => {
    const ids = ENGINE_LEVELS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(isEngineLevelId(DEFAULT_ENGINE_LEVEL_ID)).toBe(true);
  });

  it("issues a go command and a positive budget for every level", () => {
    for (const level of ENGINE_LEVELS) {
      expect(goCommandForLevel(level.id)).toMatch(/^go (depth|movetime) \d+$/);
      expect(budgetMsForLevel(level.id)).toBeGreaterThan(0);
    }
  });
});

describe("isEngineLevelId", () => {
  it("accepts every defined level", () => {
    for (const level of ENGINE_LEVELS) {
      expect(isEngineLevelId(level.id)).toBe(true);
    }
  });

  // The level can arrive from a <select> or persisted client storage, so
  // anything at all is reachable here.
  it("rejects everything else", () => {
    expect(isEngineLevelId("l9")).toBe(false);
    expect(isEngineLevelId("")).toBe(false);
    expect(isEngineLevelId(undefined)).toBe(false);
    expect(isEngineLevelId(null)).toBe(false);
    expect(isEngineLevelId(2)).toBe(false);
    expect(isEngineLevelId({})).toBe(false);
    expect(isEngineLevelId(["l1"])).toBe(false);
  });
});

describe("getEngineLevel", () => {
  it("throws rather than half-configuring the engine on an unknown id", () => {
    // @ts-expect-error — deliberately out of contract
    expect(() => getEngineLevel("nope")).toThrow(/Unknown engine level/);
  });
});
