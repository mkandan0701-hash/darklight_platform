import { describe, expect, it } from "vitest";
import { DEFAULT_POSITION } from "chess.js";
import { parsePositionInput } from "./positionInput";

const ok = (text: string) => {
  const result = parsePositionInput(text);
  if (!result.ok) throw new Error(`expected success, got: ${result.error}`);
  return result.position;
};

describe("parsePositionInput — FEN", () => {
  it("accepts a full six-field FEN", () => {
    const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3";

    expect(ok(fen)).toEqual({ startFen: fen, uciMoves: [], source: "fen" });
  });

  // chess.js validateFen demands six fields, but boards and engine dumps
  // routinely emit four. Rejecting those would be rejecting input a human
  // would call a perfectly good FEN.
  it("pads a four-field FEN rather than rejecting it", () => {
    const position = ok("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -");

    expect(position.startFen).toBe(DEFAULT_POSITION);
    expect(position.source).toBe("fen");
  });

  it("pads a five-field FEN", () => {
    expect(ok("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0").startFen).toBe(
      DEFAULT_POSITION
    );
  });

  it("tolerates surrounding whitespace", () => {
    expect(ok(`\n  ${DEFAULT_POSITION}  \n`).startFen).toBe(DEFAULT_POSITION);
  });

  it("rejects a FEN with an impossible board", () => {
    const result = parsePositionInput("xxxx/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    expect(result.ok).toBe(false);
  });
});

describe("parsePositionInput — PGN", () => {
  it("reads a PGN with a full tag roster", () => {
    const pgn = [
      '[Event "Casual game"]',
      '[Site "lichess.org"]',
      '[White "alice"]',
      '[Black "bob"]',
      '[Result "1-0"]',
      "",
      "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0",
    ].join("\n");

    const position = ok(pgn);
    expect(position.source).toBe("pgn");
    expect(position.startFen).toBe(DEFAULT_POSITION);
    expect(position.uciMoves).toEqual(["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6"]);
  });

  it("reads bare movetext with no tags at all", () => {
    expect(ok("1. d4 d5 2. c4").uciMoves).toEqual(["d2d4", "d7d5", "c2c4"]);
  });

  it("honours a [FEN] tag as the start position", () => {
    const fen = "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1";
    const pgn = `[SetUp "1"]\n[FEN "${fen}"]\n\n1. e4`;

    const position = ok(pgn);
    expect(position.startFen).toBe(fen);
    expect(position.uciMoves).toEqual(["e2e4"]);
  });

  // Real exports are full of these; chess.js loadPgn throws rather than
  // returning false, so an unguarded call takes the page down.
  it("survives clock comments and NAGs", () => {
    const pgn = "1. e4 { [%clk 0:03:00] } e5 $1 { [%clk 0:02:58] } 2. Nf3 *";

    expect(ok(pgn).uciMoves).toEqual(["e2e4", "e7e5", "g1f3"]);
  });

  it("analyses the first game of a multi-game export", () => {
    const pgn = [
      '[Event "Game one"]',
      "",
      "1. e4 e5 1-0",
      "",
      '[Event "Game two"]',
      "",
      "1. d4 d5 0-1",
    ].join("\n");

    expect(ok(pgn).uciMoves).toEqual(["e2e4", "e7e5"]);
  });
});

describe("parsePositionInput — rejections", () => {
  it("asks for input when given nothing", () => {
    expect(parsePositionInput("")).toMatchObject({ ok: false });
    expect(parsePositionInput("   \n  ")).toMatchObject({ ok: false });
  });

  it("rejects prose", () => {
    const result = parsePositionInput("please analyse my game thanks");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/FEN or PGN/i);
  });

  it("reports an illegal move in a PGN rather than throwing", () => {
    expect(() => parsePositionInput("1. e4 e5 2. Ke3")).not.toThrow();
    expect(parsePositionInput("1. e9 e5").ok).toBe(false);
  });

  it("rejects a headers-only PGN with no moves and no FEN", () => {
    const result = parsePositionInput('[Event "Empty"]\n[Result "*"]\n\n*');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/no moves/i);
  });
});
