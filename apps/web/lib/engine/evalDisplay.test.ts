import { describe, expect, it } from "vitest";
import { DEFAULT_POSITION } from "chess.js";
import { evalView, formatVariation, pvToSan } from "./evalDisplay";
import type { EngineInfo } from "./uci";

const info = (over: Partial<EngineInfo>): EngineInfo => ({
  depth: 12,
  multipv: 1,
  scoreCp: null,
  scoreMate: null,
  bound: null,
  pv: [],
  nodes: null,
  nps: null,
  timeMs: null,
  ...over,
});

describe("evalView", () => {
  it("labels a White advantage with an explicit plus", () => {
    expect(evalView(info({ scoreCp: 124 }), "w")?.text).toBe("+1.24");
  });

  it("labels equality without a sign", () => {
    expect(evalView(info({ scoreCp: 0 }), "w")?.text).toBe("0.00");
  });

  // The bug this guards: the engine reports relative to the side to move, so
  // without the flip an equal position reads as winning for whoever is on move.
  it("flips both label and bar when Black is to move", () => {
    const asWhite = evalView(info({ scoreCp: 200 }), "w")!;
    const asBlack = evalView(info({ scoreCp: 200 }), "b")!;

    expect(asWhite.text).toBe("+2.00");
    expect(asBlack.text).toBe("−2.00");
    expect(asWhite.fraction).toBeGreaterThan(0.5);
    expect(asBlack.fraction).toBeLessThan(0.5);
  });

  it("puts the bar at the halfway mark for a dead-equal position", () => {
    expect(evalView(info({ scoreCp: 0 }), "w")?.fraction).toBeCloseTo(0.5, 5);
  });

  it("moves the bar monotonically with the score", () => {
    const at = (cp: number) => evalView(info({ scoreCp: cp }), "w")!.fraction;

    expect(at(-800)).toBeLessThan(at(-100));
    expect(at(-100)).toBeLessThan(at(0));
    expect(at(0)).toBeLessThan(at(100));
    expect(at(100)).toBeLessThan(at(800));
  });

  it("never lets the bar reach a hard 0 or 1 on a centipawn score", () => {
    // A fully empty bar reads as a rendering bug rather than a lost position.
    expect(evalView(info({ scoreCp: -99999 }), "w")!.fraction).toBeGreaterThan(0);
    expect(evalView(info({ scoreCp: 99999 }), "w")!.fraction).toBeLessThan(1);
  });

  it("labels mate scores and pins the bar", () => {
    expect(evalView(info({ scoreMate: 3 }), "w")).toMatchObject({
      text: "M3",
      fraction: 1,
      isMate: true,
    });
    expect(evalView(info({ scoreMate: -2 }), "w")).toMatchObject({
      text: "-M2",
      fraction: 0,
      isMate: true,
    });
  });

  it("flips a mate score for the side to move", () => {
    // Black to move with mate in 3 is bad for White.
    expect(evalView(info({ scoreMate: 3 }), "b")).toMatchObject({ text: "-M3", fraction: 0 });
  });

  it("returns null when the line carried no score", () => {
    expect(evalView(info({}), "w")).toBeNull();
  });
});

describe("pvToSan", () => {
  it("converts a UCI variation to SAN", () => {
    expect(pvToSan(DEFAULT_POSITION, ["e2e4", "e7e5", "g1f3"])).toEqual(["e4", "e5", "Nf3"]);
  });

  // A PV from a superseded search can be illegal in the position now on the
  // board; that must truncate, not throw.
  it("stops at the first move that doesn't apply", () => {
    expect(pvToSan(DEFAULT_POSITION, ["e2e4", "e7e5", "e2e4", "g1f3"])).toEqual(["e4", "e5"]);
  });

  it("caps the number of plies rendered", () => {
    const pv = ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6"];

    expect(pvToSan(DEFAULT_POSITION, pv, 3)).toEqual(["e4", "e5", "Nf3"]);
  });

  it("returns nothing for an unusable start position", () => {
    expect(pvToSan("not a fen", ["e2e4"])).toEqual([]);
    expect(pvToSan(DEFAULT_POSITION, [])).toEqual([]);
  });

  it("renders promotions in SAN", () => {
    expect(pvToSan("8/4P3/8/8/8/8/8/4K2k w - - 0 1", ["e7e8q"])).toEqual(["e8=Q"]);
  });
});

describe("formatVariation", () => {
  it("numbers a variation starting with White", () => {
    expect(formatVariation(["e4", "e5", "Nf3"], 1, "w")).toBe("1. e4 e5 2. Nf3");
  });

  it("spells out the move number when Black opens the variation", () => {
    expect(formatVariation(["e5", "Nf3", "Nc6"], 1, "b")).toBe("1... e5 2. Nf3 Nc6");
  });

  it("continues from a mid-game move number", () => {
    expect(formatVariation(["Bb5", "a6"], 3, "w")).toBe("3. Bb5 a6");
  });

  it("handles an empty variation", () => {
    expect(formatVariation([], 1, "w")).toBe("");
  });
});
