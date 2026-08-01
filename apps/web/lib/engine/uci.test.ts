import { describe, expect, it } from "vitest";
import {
  MATE_SCORE,
  moveFromUci,
  parseBestMove,
  parseInfoLine,
  positionCommand,
  scoreToWhitePov,
  uciFromMove,
} from "./uci";

describe("parseInfoLine", () => {
  it("parses a full info line", () => {
    const info = parseInfoLine(
      "info depth 12 seldepth 18 multipv 1 score cp 34 nodes 91234 nps 456170 hashfull 12 tbhits 0 time 200 pv e2e4 e7e5 g1f3"
    );

    expect(info).toMatchObject({
      depth: 12,
      multipv: 1,
      scoreCp: 34,
      scoreMate: null,
      bound: null,
      nodes: 91234,
      nps: 456170,
      timeMs: 200,
    });
    expect(info?.pv).toEqual(["e2e4", "e7e5", "g1f3"]);
  });

  it("returns null for engine chatter", () => {
    expect(parseInfoLine("info string NNUE evaluation using nn-1234.nnue")).toBeNull();
    // `string` runs to end of line, so tokens after it must not be parsed.
    expect(parseInfoLine("info string depth 99 score cp 900")).toBeNull();
  });

  it("returns null for a progress line carrying no score and no pv", () => {
    expect(parseInfoLine("info depth 5 currmove e2e4 currmovenumber 1")).toBeNull();
  });

  it("keeps a line that has a pv but no score", () => {
    expect(parseInfoLine("info depth 3 pv e2e4")?.pv).toEqual(["e2e4"]);
  });

  it("flags an unsettled bound rather than treating it as a real score", () => {
    expect(parseInfoLine("info depth 20 score cp 34 upperbound nodes 5 pv e2e4")?.bound).toBe(
      "upper"
    );
    expect(parseInfoLine("info depth 20 score cp 34 lowerbound nodes 5 pv e2e4")?.bound).toBe(
      "lower"
    );
  });

  it("parses mate scores in both directions", () => {
    expect(parseInfoLine("info depth 10 score mate 3 pv e2e4")?.scoreMate).toBe(3);
    expect(parseInfoLine("info depth 10 score mate -2 pv e2e4")?.scoreMate).toBe(-2);
    expect(parseInfoLine("info depth 10 score mate 1 pv d1h5")?.scoreMate).toBe(1);
  });

  it("parses a MultiPV line", () => {
    const info = parseInfoLine("info depth 20 multipv 2 score cp -15 pv d2d4 d7d5");

    expect(info?.multipv).toBe(2);
    expect(info?.scoreCp).toBe(-15);
    expect(info?.pv).toEqual(["d2d4", "d7d5"]);
  });

  it("defaults multipv to 1 when absent", () => {
    expect(parseInfoLine("info depth 4 score cp 10 pv e2e4")?.multipv).toBe(1);
  });

  it("ignores non-info lines and tolerates junk", () => {
    expect(parseInfoLine("readyok")).toBeNull();
    expect(parseInfoLine("")).toBeNull();
    expect(parseInfoLine("   ")).toBeNull();
    expect(() => parseInfoLine("info depth")).not.toThrow();
    expect(() => parseInfoLine("info score cp")).not.toThrow();
  });
});

describe("parseBestMove", () => {
  it("parses a bestmove with a ponder move", () => {
    expect(parseBestMove("bestmove e2e4 ponder e7e5")).toEqual({
      bestmove: "e2e4",
      ponder: "e7e5",
    });
  });

  it("parses a bestmove without a ponder move", () => {
    expect(parseBestMove("bestmove g1f3")).toEqual({ bestmove: "g1f3", ponder: null });
  });

  // Sent when the position is already checkmate or stalemate. Slicing this as
  // a move yields from "(n" / to "one", which crashes chess.js.
  it("maps (none) to a null bestmove", () => {
    expect(parseBestMove("bestmove (none)")).toEqual({ bestmove: null, ponder: null });
    expect(parseBestMove("bestmove 0000")).toEqual({ bestmove: null, ponder: null });
  });

  it("parses a promotion bestmove", () => {
    expect(parseBestMove("bestmove e7e8q")?.bestmove).toBe("e7e8q");
  });

  it("returns null for other lines", () => {
    expect(parseBestMove("info depth 1 score cp 5 pv e2e4")).toBeNull();
    expect(parseBestMove("uciok")).toBeNull();
    expect(parseBestMove("")).toBeNull();
  });
});

describe("uciFromMove / moveFromUci", () => {
  it("round-trips a plain move", () => {
    expect(uciFromMove({ from: "e2", to: "e4" })).toBe("e2e4");
    expect(moveFromUci("e2e4")).toEqual({ from: "e2", to: "e4", promotion: undefined });
  });

  it("round-trips a promotion", () => {
    expect(uciFromMove({ from: "e7", to: "e8", promotion: "q" })).toBe("e7e8q");
    expect(moveFromUci("e7e8q")).toEqual({ from: "e7", to: "e8", promotion: "q" });
  });
});

describe("positionCommand", () => {
  it("omits the moves clause when there are none", () => {
    // `position startpos moves` with an empty list is a protocol error.
    expect(positionCommand("startpos", [])).toBe("position startpos");
  });

  it("appends moves from the start position", () => {
    expect(positionCommand("startpos", ["e2e4", "e7e5"])).toBe(
      "position startpos moves e2e4 e7e5"
    );
  });

  it("uses the fen form for an arbitrary position", () => {
    const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3";

    expect(positionCommand(fen, [])).toBe(`position fen ${fen}`);
    expect(positionCommand(fen, ["g8f6"])).toBe(`position fen ${fen} moves g8f6`);
  });
});

describe("scoreToWhitePov", () => {
  const info = (over: Partial<ReturnType<typeof parseInfoLine>> = {}) => ({
    depth: 10,
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

  // The engine always reports relative to the side to move, so the same "+2.0"
  // means opposite things depending on turn — flipping this flips the eval bar.
  it("negates the score when black is to move", () => {
    expect(scoreToWhitePov(info({ scoreCp: 200 }), "w")).toBe(200);
    expect(scoreToWhitePov(info({ scoreCp: 200 }), "b")).toBe(-200);
  });

  it("ranks a nearer mate above a further one", () => {
    const mateIn1 = scoreToWhitePov(info({ scoreMate: 1 }), "w")!;
    const mateIn5 = scoreToWhitePov(info({ scoreMate: 5 }), "w")!;

    expect(mateIn1).toBeGreaterThan(mateIn5);
    expect(mateIn1).toBe(MATE_SCORE - 1);
  });

  it("signs a mate against the side to move as negative", () => {
    expect(scoreToWhitePov(info({ scoreMate: -3 }), "w")).toBe(-(MATE_SCORE - 3));
    // Black to move and mating: bad for White.
    expect(scoreToWhitePov(info({ scoreMate: 3 }), "b")).toBe(-(MATE_SCORE - 3));
  });

  it("returns null when there is no score", () => {
    expect(scoreToWhitePov(info(), "w")).toBeNull();
  });
});
