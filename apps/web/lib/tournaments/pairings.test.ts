import { describe, expect, it } from "vitest";
import {
  assignColors,
  pairArena,
  pairRound,
  pairSwiss,
  scoreForResult,
  type PairingPlayer,
} from "./pairings";

function player(id: string, over: Partial<PairingPlayer> = {}): PairingPlayer {
  return { id, score: 0, opponents: [], colors: [], hadBye: false, ...over };
}

const idsOf = (pairings: { whiteId: string; blackId: string | null }[]) =>
  pairings.map((p) => [p.whiteId, p.blackId]);

describe("assignColors", () => {
  it("gives White to whoever has had it less often", () => {
    const a = player("a", { colors: ["w", "w"] });
    const b = player("b", { colors: ["b", "b"] });
    expect(assignColors(a, b)).toEqual({ whiteId: "b", blackId: "a" });
  });

  it("alternates when the balance is level but the last colours differ", () => {
    const a = player("a", { colors: ["w", "b"] });
    const b = player("b", { colors: ["b", "w"] });
    expect(assignColors(a, b)).toEqual({ whiteId: "a", blackId: "b" });
  });

  it("falls back to the standings when there is nothing to separate them", () => {
    expect(assignColors(player("a"), player("b"))).toEqual({ whiteId: "a", blackId: "b" });
  });
});

describe("pairSwiss", () => {
  it("pairs within score groups, strongest against strongest", () => {
    const players = [
      player("a", { score: 2 }),
      player("b", { score: 2 }),
      player("c", { score: 0 }),
      player("d", { score: 0 }),
    ];
    expect(idsOf(pairSwiss(players))).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  // The rule a Swiss event lives or dies by: playing the same person twice
  // while a fresh opponent is sitting there is the bug people notice.
  it("avoids a rematch when any alternative exists", () => {
    const players = [
      player("a", { score: 1, opponents: ["b"] }),
      player("b", { score: 1, opponents: ["a"] }),
      player("c", { score: 1 }),
      player("d", { score: 1 }),
    ];
    const pairs = idsOf(pairSwiss(players));
    expect(pairs).not.toContainEqual(["a", "b"]);
    expect(pairs).not.toContainEqual(["b", "a"]);
    expect(pairs).toHaveLength(2);
  });

  // A small academy field genuinely runs out of fresh opponents. A repeat
  // pairing is a worse round; no round at all is a broken event.
  it("allows a rematch rather than failing when nothing else is left", () => {
    const players = [
      player("a", { opponents: ["b"] }),
      player("b", { opponents: ["a"] }),
    ];
    expect(idsOf(pairSwiss(players))).toEqual([["a", "b"]]);
  });

  it("gives an odd field a bye, to the lowest scorer who has not had one", () => {
    const players = [
      player("a", { score: 2 }),
      player("b", { score: 1 }),
      player("c", { score: 0 }),
    ];
    const pairs = pairSwiss(players);
    expect(pairs).toContainEqual({ whiteId: "c", blackId: null });
    expect(pairs).toHaveLength(2);
  });

  it("does not hand the same player a second bye while others have had none", () => {
    const players = [
      player("a", { score: 2 }),
      player("b", { score: 1 }),
      player("c", { score: 0, hadBye: true }),
    ];
    const bye = pairSwiss(players).find((p) => p.blackId === null);
    expect(bye?.whiteId).toBe("b");
  });

  it("still produces a bye when everyone has already had one", () => {
    const players = [
      player("a", { score: 1, hadBye: true }),
      player("b", { score: 0, hadBye: true }),
      player("c", { score: 0, hadBye: true }),
    ];
    expect(pairSwiss(players).filter((p) => p.blackId === null)).toHaveLength(1);
  });

  it("pairs everyone exactly once", () => {
    const players = ["a", "b", "c", "d", "e", "f"].map((id, i) => player(id, { score: i % 3 }));
    const pairs = pairSwiss(players);
    const seen = pairs.flatMap((p) => [p.whiteId, p.blackId]).filter(Boolean);
    expect(new Set(seen).size).toBe(6);
  });

  it("returns nothing for an empty field", () => {
    expect(pairSwiss([])).toEqual([]);
  });

  it("gives a lone entrant the bye rather than pairing them with nobody", () => {
    expect(pairSwiss([player("a")])).toEqual([{ whiteId: "a", blackId: null }]);
  });
});

describe("pairArena", () => {
  it("pairs by nearest score", () => {
    const players = [
      player("a", { score: 5 }),
      player("b", { score: 4 }),
      player("c", { score: 1 }),
      player("d", { score: 0 }),
    ];
    expect(idsOf(pairArena(players))).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("skips an immediate rematch by taking the next nearest instead", () => {
    const players = [
      player("a", { score: 3, opponents: ["b"] }),
      player("b", { score: 3 }),
      player("c", { score: 2 }),
    ];
    expect(idsOf(pairArena(players))[0]).toEqual(["a", "c"]);
  });

  // The defining difference from Swiss: an arena has no byes. The odd player
  // out waits for the next pairing rather than banking a free point.
  it("leaves the odd player out unpaired instead of giving a bye", () => {
    const pairs = pairArena([player("a"), player("b"), player("c")]);
    expect(pairs).toHaveLength(1);
    expect(pairs.every((p) => p.blackId !== null)).toBe(true);
  });
});

describe("pairRound", () => {
  it("dispatches on format", () => {
    const odd = [player("a"), player("b"), player("c")];
    expect(pairRound("SWISS", odd).some((p) => p.blackId === null)).toBe(true);
    expect(pairRound("ARENA", odd).some((p) => p.blackId === null)).toBe(false);
  });
});

describe("scoreForResult", () => {
  it("scores decisive games and draws", () => {
    expect(scoreForResult("1-0")).toEqual({ white: 1, black: 0 });
    expect(scoreForResult("0-1")).toEqual({ white: 0, black: 1 });
    expect(scoreForResult("1/2-1/2")).toEqual({ white: 0.5, black: 0.5 });
  });

  it("scores an unrecognised result as nothing rather than guessing", () => {
    expect(scoreForResult("*")).toEqual({ white: 0, black: 0 });
  });
});
