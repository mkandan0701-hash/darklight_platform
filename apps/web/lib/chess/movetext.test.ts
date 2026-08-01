import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { movetextFromPgn } from "./movetext";

describe("movetextFromPgn", () => {
  // The bug this exists for: the move list rendered the whole seven-tag
  // roster — `[Event "?"] [Site "?"] ... 1. d4 *` — instead of "1. d4".
  it("drops the seven-tag roster chess.js always emits", () => {
    const chess = new Chess();
    chess.move("d4");

    expect(movetextFromPgn(chess.pgn())).toBe("1. d4");
  });

  it("keeps full move numbering across several moves", () => {
    const chess = new Chess();
    for (const san of ["e4", "e5", "Nf3", "Nc6"]) chess.move(san);

    expect(movetextFromPgn(chess.pgn())).toBe("1. e4 e5 2. Nf3 Nc6");
  });

  it("strips the in-progress marker chess.js always appends", () => {
    // chess.js leaves Result as "*" even after checkmate, so the raw movetext
    // ends "... Qh4# *". See exportPgn.ts, which fixes that for real exports.
    const chess = new Chess();
    for (const san of ["f3", "e5", "g4", "Qh4#"]) chess.move(san);

    expect(movetextFromPgn(chess.pgn())).toBe("1. f3 e5 2. g4 Qh4#");
  });

  it("keeps a real result when one has been set", () => {
    const chess = new Chess();
    for (const san of ["f3", "e5", "g4", "Qh4#"]) chess.move(san);
    chess.header("Result", "0-1");

    expect(movetextFromPgn(chess.pgn())).toContain("0-1");
  });

  it("numbers correctly when Black has the first move", () => {
    const chess = new Chess(
      "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
    );
    chess.move("Nc6");

    // Rebuilding numbering from history() by hand would have called this
    // "1. Nc6" and put the move on the wrong side.
    expect(movetextFromPgn(chess.pgn())).toBe("1. ... Nc6");
  });

  it("returns an empty string for a game with no moves", () => {
    expect(movetextFromPgn(new Chess().pgn())).toBe("");
  });
});
