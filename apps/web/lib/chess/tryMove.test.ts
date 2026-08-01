import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { tryMove } from "./tryMove";

describe("tryMove", () => {
  it("plays a legal move and returns it", () => {
    const chess = new Chess();

    const move = tryMove(chess, { from: "e2", to: "e4", promotion: "q" });

    expect(move?.san).toBe("e4");
    expect(chess.fen()).toBe(
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
    );
  });

  // The regression this file exists for: chess.js v1 throws here rather than
  // returning null, so `if (!move)` never runs and the throw escapes the
  // caller — in a React drag handler that unmounts the board.
  it("returns null instead of throwing on an illegal move", () => {
    const chess = new Chess();

    expect(() => tryMove(chess, { from: "e2", to: "e5", promotion: "q" })).not.toThrow();
    expect(tryMove(chess, { from: "e2", to: "e5", promotion: "q" })).toBeNull();
  });

  it("leaves the position untouched when the move is illegal", () => {
    const chess = new Chess();
    const before = chess.fen();

    tryMove(chess, { from: "e2", to: "e5" });

    expect(chess.fen()).toBe(before);
  });

  it("returns null for a move off an empty square", () => {
    const chess = new Chess();

    expect(tryMove(chess, { from: "e4", to: "e5" })).toBeNull();
  });

  it("returns null for a square that isn't on the board", () => {
    const chess = new Chess();

    // Squares arrive as plain strings from socket payloads, so garbage is
    // reachable — it must not throw.
    expect(tryMove(chess, { from: "zz", to: "e4" })).toBeNull();
  });

  it("returns null for a move that would leave the king in check", () => {
    // Black king on e8, white rook on e1: the e7 knight is pinned.
    const chess = new Chess("4k3/4n3/8/8/8/8/8/4R1K1 b - - 0 1");

    expect(tryMove(chess, { from: "e7", to: "c6" })).toBeNull();
  });

  it("promotes with the requested piece", () => {
    const chess = new Chess("8/4P3/8/8/8/8/8/4K2k w - - 0 1");

    const move = tryMove(chess, { from: "e7", to: "e8", promotion: "n" });

    expect(move?.promotion).toBe("n");
    expect(move?.san).toBe("e8=N");
  });

  it("round-trips the UCI serialization the rest of the app uses", () => {
    const chess = new Chess("8/4P3/8/8/8/8/8/4K2k w - - 0 1");

    const move = tryMove(chess, { from: "e7", to: "e8", promotion: "q" });

    expect(`${move?.from}${move?.to}${move?.promotion ?? ""}`).toBe("e7e8q");
  });
});
