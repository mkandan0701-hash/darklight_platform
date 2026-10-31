import { describe, expect, it } from "vitest";
import { parseFenBoard } from "./parseFen";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("parseFenBoard", () => {
  describe("orientation — the assertions that catch a transposed rank or file", () => {
    it("puts a8 at index 0 and h1 at index 63", () => {
      const parsed = parseFenBoard(START)!;
      // Black's queenside rook is a8; White's kingside rook is h1. If ranks
      // were reversed both would be uppercase/lowercase the other way round;
      // if files were reversed this still passes, hence the next test.
      expect(parsed.squares[0]).toBe("r");
      expect(parsed.squares[63]).toBe("R");
    });

    it("reads files left to right — d8 is the black queen, e8 the king", () => {
      const parsed = parseFenBoard(START)!;
      // A file flip would swap these two, and nothing else in the start
      // position would notice, because it is otherwise mirror-symmetric.
      expect(parsed.squares[3]).toBe("q");
      expect(parsed.squares[4]).toBe("k");
      expect(parsed.squares[59]).toBe("Q");
      expect(parsed.squares[60]).toBe("K");
    });

    it("places a lone mid-board piece on the right square", () => {
      // A white knight on e4. Rank 4 is the fifth rank listed, so index
      // 4*8 = 32 starts it; e is the fifth file, so index 36.
      const parsed = parseFenBoard("8/8/8/8/4N3/8/8/8 w - - 0 1")!;
      expect(parsed.squares[36]).toBe("N");
      expect(parsed.squares.filter(Boolean)).toHaveLength(1);
    });
  });

  describe("side to move", () => {
    it("reads b from the second field", () => {
      expect(parseFenBoard("8/8/8/8/8/8/8/8 b - - 0 1")!.sideToMove).toBe("b");
    });

    it("defaults to white when the field is missing", () => {
      expect(parseFenBoard("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR")!.sideToMove).toBe("w");
    });

    it("defaults to white for an unrecognised field rather than failing", () => {
      expect(parseFenBoard("8/8/8/8/8/8/8/8 x - - 0 1")!.sideToMove).toBe("w");
    });
  });

  describe("rejects structurally broken input", () => {
    const bad: [string, string][] = [
      ["a rank summing to 7", "rnbqkbn/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1"],
      ["a rank summing to 9", "rnbqkbnrr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1"],
      ["digits overshooting the rank", "45/8/8/8/8/8/8/8 w - - 0 1"],
      ["a piece pushing the rank past 8", "8p/8/8/8/8/8/8/8 w - - 0 1"],
      ["seven ranks", "8/8/8/8/8/8/8 w - - 0 1"],
      ["nine ranks", "8/8/8/8/8/8/8/8/8 w - - 0 1"],
      ["the digit 0", "0rnbqkbn/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1"],
      ["the digit 9", "9/8/8/8/8/8/8/8 w - - 0 1"],
      ["an unknown letter", "xnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1"],
      ["an empty string", ""],
      ["whitespace only", "   "],
    ];

    for (const [label, fen] of bad) {
      it(`returns null for ${label}`, () => {
        expect(parseFenBoard(fen)).toBeNull();
      });
    }
  });

  describe("tolerates what it should", () => {
    it("ignores surrounding whitespace", () => {
      expect(parseFenBoard(`  ${START}  `)).not.toBeNull();
    });

    it("ignores castling, en passant and the clocks", () => {
      const withEp = parseFenBoard("8/8/8/3pP3/8/8/8/8 w - d6 0 2");
      expect(withEp).not.toBeNull();
      expect(withEp!.squares.filter(Boolean)).toHaveLength(2);
    });

    // This is a *display* renderer, not a legality checker. Composed studies
    // and coach uploads are not always legal positions, and refusing to draw
    // one is a worse outcome than drawing it. This test exists to stop
    // someone "improving" the parser by routing it through chess.js, which
    // would both throw here and add ~100 KB to the bundle.
    it("accepts a position with no black king", () => {
      const parsed = parseFenBoard("8/8/8/8/4Q3/8/8/4K3 w - - 0 1");
      expect(parsed).not.toBeNull();
      expect(parsed!.squares.filter((s) => s === "k")).toHaveLength(0);
    });

    // "44" is non-canonical FEN — a writer should emit "8" — but it describes
    // a valid empty rank and there is no reason for a renderer to be stricter
    // than the thing that produced the string.
    it("accepts a non-canonical digit run that still sums to 8", () => {
      const parsed = parseFenBoard("44/8/8/8/8/8/8/8 w - - 0 1");
      expect(parsed).not.toBeNull();
      expect(parsed!.squares.every((s) => s === null)).toBe(true);
    });

    it("accepts an entirely empty board", () => {
      const parsed = parseFenBoard("8/8/8/8/8/8/8/8 w - - 0 1")!;
      expect(parsed.squares).toHaveLength(64);
      expect(parsed.squares.every((s) => s === null)).toBe(true);
    });
  });

  it("parses a real asymmetric puzzle position", () => {
    // Lichess-style mate puzzle: black to move, pieces on both wings.
    const parsed = parseFenBoard("r1bk3r/p2pBpNp/n4n2/1p1NP2P/6P1/3P4/P1P1K3/q5b1 b - - 1 23")!;
    expect(parsed.sideToMove).toBe("b");
    expect(parsed.squares).toHaveLength(64);
    expect(parsed.squares[0]).toBe("r"); // a8
    expect(parsed.squares[3]).toBe("k"); // d8, the black king
    expect(parsed.squares[56]).toBe("q"); // a1, the black queen
  });
});
