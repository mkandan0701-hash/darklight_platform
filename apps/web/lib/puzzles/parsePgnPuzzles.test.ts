import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { isValidPuzzle, MAX_GAMES_PER_UPLOAD, parsePgnPuzzles } from "./parsePgnPuzzles";

/**
 * Builds a valid puzzle PGN (FEN header + `movesCount` legal solution moves
 * played from that FEN) so fixtures are guaranteed-legal rather than
 * hand-typed SAN that might not actually be playable.
 */
function buildPuzzlePgn(fen: string, movesCount: number): { pgn: string; uciMoves: string[] } {
  const chess = new Chess(fen);
  const uciMoves: string[] = [];
  const sanMoves: string[] = [];
  for (let i = 0; i < movesCount; i++) {
    const legal = chess.moves()[0];
    const move = chess.move(legal);
    sanMoves.push(move.san);
    uciMoves.push(`${move.from}${move.to}${move.promotion ?? ""}`);
  }

  const startMoveNumber = Number(fen.split(" ")[5]);
  const blackToMove = fen.split(" ")[1] === "b";
  const movetext = sanMoves
    .map((san, i) => {
      const moveNumber = startMoveNumber + Math.floor((i + (blackToMove ? 1 : 0)) / 2);
      const isWhiteMove = blackToMove ? i % 2 === 1 : i % 2 === 0;
      if (i === 0 && blackToMove) return `${moveNumber}...${san}`;
      return isWhiteMove ? `${moveNumber}.${san}` : san;
    })
    .join(" ");

  const pgn = [
    '[Event "Test"]',
    '[Site "?"]',
    '[Date "????.??.??"]',
    '[Round "?"]',
    '[White "?"]',
    '[Black "?"]',
    '[Result "*"]',
    '[SetUp "1"]',
    `[FEN "${fen}"]`,
    "",
    `${movetext} *`,
  ].join("\n");

  return { pgn, uciMoves };
}

const MATE_IN_2_FEN = "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24";
const ANOTHER_FEN = "5rk1/1p3ppp/pq3b2/8/8/1P1Q1N2/P4PPP/3R2K1 w - - 2 27";

describe("parsePgnPuzzles", () => {
  it("returns no puzzles or errors for empty input", () => {
    expect(parsePgnPuzzles("")).toEqual({ puzzles: [], errors: [] });
    expect(parsePgnPuzzles("   \n  ")).toEqual({ puzzles: [], errors: [] });
  });

  it("parses a single well-formed puzzle", () => {
    const { pgn, uciMoves } = buildPuzzlePgn(MATE_IN_2_FEN, 2);
    const result = parsePgnPuzzles(pgn);

    expect(result.errors).toEqual([]);
    expect(result.puzzles).toEqual([{ fen: MATE_IN_2_FEN, moves: uciMoves.join(" ") }]);
  });

  it("parses multiple games in one file as separate puzzles", () => {
    const a = buildPuzzlePgn(MATE_IN_2_FEN, 2);
    const b = buildPuzzlePgn(ANOTHER_FEN, 2);
    const result = parsePgnPuzzles(`${a.pgn}\n\n${b.pgn}`);

    expect(result.errors).toEqual([]);
    expect(result.puzzles).toEqual([
      { fen: MATE_IN_2_FEN, moves: a.uciMoves.join(" ") },
      { fen: ANOTHER_FEN, moves: b.uciMoves.join(" ") },
    ]);
  });

  it("reports a per-game error for a game missing the FEN tag, without dropping valid games", () => {
    const good = buildPuzzlePgn(MATE_IN_2_FEN, 2);
    const noFen = [
      '[Event "No FEN"]',
      '[Site "?"]',
      '[Date "????.??.??"]',
      '[Round "?"]',
      '[White "?"]',
      '[Black "?"]',
      '[Result "*"]',
      "",
      "1. e4 e5 *",
    ].join("\n");

    const result = parsePgnPuzzles(`${noFen}\n\n${good.pgn}`);

    expect(result.errors).toEqual([
      { gameIndex: 1, message: expect.stringContaining("Missing a [FEN") },
    ]);
    expect(result.puzzles).toEqual([{ fen: MATE_IN_2_FEN, moves: good.uciMoves.join(" ") }]);
  });

  it("reports a per-game error for unparseable move text", () => {
    const malformed = '[Event "Broken"]\n\nthis is not valid move text *';
    const result = parsePgnPuzzles(malformed);

    expect(result.puzzles).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].gameIndex).toBe(1);
  });

  it("treats a file with no [Event tag at all as a single game", () => {
    const { pgn } = buildPuzzlePgn(MATE_IN_2_FEN, 1);
    const withoutEventTag = pgn.replace(/^\[Event.*\]\n/, "");
    const result = parsePgnPuzzles(withoutEventTag);

    expect(result.puzzles).toHaveLength(1);
  });

  it("caps processing at MAX_GAMES_PER_UPLOAD and reports a truncation error", () => {
    const minimalGameNoFen = [
      '[Event "Test"]',
      '[Site "?"]',
      '[Date "????.??.??"]',
      '[Round "?"]',
      '[White "?"]',
      '[Black "?"]',
      '[Result "*"]',
      "",
      "*",
    ].join("\n");
    const tooMany = Array(MAX_GAMES_PER_UPLOAD + 1).fill(minimalGameNoFen).join("\n\n");

    const result = parsePgnPuzzles(tooMany);

    // The truncation notice, plus one "missing FEN" error per processed game.
    expect(result.errors).toHaveLength(MAX_GAMES_PER_UPLOAD + 1);
    expect(result.errors[0].message).toContain(`${MAX_GAMES_PER_UPLOAD + 1} games`);
    expect(result.puzzles).toEqual([]);
  });
});

describe("isValidPuzzle", () => {
  it("accepts a puzzle whose moves are legal from its FEN", () => {
    const { uciMoves } = buildPuzzlePgn(MATE_IN_2_FEN, 2);
    expect(isValidPuzzle({ fen: MATE_IN_2_FEN, moves: uciMoves.join(" ") })).toBe(true);
  });

  it("rejects a malformed FEN", () => {
    expect(isValidPuzzle({ fen: "not-a-fen", moves: "e2e4" })).toBe(false);
  });

  it("rejects an illegal move from an otherwise-valid FEN", () => {
    expect(isValidPuzzle({ fen: MATE_IN_2_FEN, moves: "a1a8" })).toBe(false);
  });
});
