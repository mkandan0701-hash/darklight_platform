import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { exportPgn } from "./exportPgn";

const meta = { white: "Student", black: "Stockfish (Level 2)", date: new Date(2026, 6, 31) };

describe("exportPgn", () => {
  // chess.js never sets Result itself — it stays "*" through checkmate — so a
  // straight chess.pgn() export marks finished games as still in progress and
  // every importer believes it.
  it("stamps the real result on a finished game", () => {
    const chess = new Chess();
    for (const san of ["f3", "e5", "g4", "Qh4#"]) chess.move(san);

    const pgn = exportPgn(chess, { ...meta, result: "0-1" });

    expect(pgn).toContain('[Result "0-1"]');
    expect(pgn).not.toContain('[Result "*"]');
  });

  it("leaves an unfinished game marked in progress", () => {
    const chess = new Chess();
    chess.move("d4");

    expect(exportPgn(chess, meta)).toContain('[Result "*"]');
  });

  it("names both players and the date", () => {
    const chess = new Chess();
    chess.move("e4");

    const pgn = exportPgn(chess, meta);

    expect(pgn).toContain('[White "Student"]');
    expect(pgn).toContain('[Black "Stockfish (Level 2)"]');
    expect(pgn).toContain('[Date "2026.07.31"]');
  });

  it("keeps the moves", () => {
    const chess = new Chess();
    for (const san of ["e4", "e5", "Nf3"]) chess.move(san);

    expect(exportPgn(chess, meta)).toContain("1. e4 e5 2. Nf3");
  });

  it("round-trips back through chess.js", () => {
    const chess = new Chess();
    for (const san of ["e4", "e5", "Nf3", "Nc6"]) chess.move(san);
    const pgn = exportPgn(chess, { ...meta, result: "*" });

    const reloaded = new Chess();
    expect(() => reloaded.loadPgn(pgn)).not.toThrow();
    expect(reloaded.history()).toEqual(["e4", "e5", "Nf3", "Nc6"]);
  });
});
