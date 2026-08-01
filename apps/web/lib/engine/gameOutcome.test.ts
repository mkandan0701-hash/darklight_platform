import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { describeOutcome, resignationOutcome } from "./gameOutcome";

describe("describeOutcome", () => {
  it("reports an ongoing game as not over", () => {
    expect(describeOutcome(new Chess(), "w")).toEqual({ over: false });
  });

  it("scores a checkmate delivered by the player as a win", () => {
    // Fool's mate: 1.f3 e5 2.g4 Qh4#. Black is mated White... i.e. White is
    // the side to move and is mated, so Black won.
    const chess = new Chess();
    chess.move("f3");
    chess.move("e5");
    chess.move("g4");
    chess.move("Qh4#");

    const asBlack = describeOutcome(chess, "b");
    expect(asBlack).toMatchObject({ over: true, result: "0-1", forPlayer: "win" });
    expect(asBlack.over && asBlack.reason).toMatch(/you win/i);
  });

  it("scores the same checkmate as a loss for the mated side", () => {
    const chess = new Chess();
    chess.move("f3");
    chess.move("e5");
    chess.move("g4");
    chess.move("Qh4#");

    const asWhite = describeOutcome(chess, "w");
    expect(asWhite).toMatchObject({ over: true, result: "0-1", forPlayer: "loss" });
    expect(asWhite.over && asWhite.reason).toMatch(/engine wins/i);
  });

  it("scores a checkmate of Black as 1-0", () => {
    // Back-rank mate: white rook lands on e8 with black king boxed in on g8.
    const chess = new Chess("6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1");
    chess.move("Re8#");

    expect(describeOutcome(chess, "w")).toMatchObject({
      over: true,
      result: "1-0",
      forPlayer: "win",
    });
  });

  // Each draw branch must survive isDraw() being true for all of them — the
  // reason is what a student learns from, so it must not collapse to "Draw."
  it("names a stalemate", () => {
    const chess = new Chess("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");

    const outcome = describeOutcome(chess, "b");
    expect(outcome).toMatchObject({ over: true, result: "1/2-1/2", forPlayer: "draw" });
    expect(outcome.over && outcome.reason).toMatch(/stalemate/i);
  });

  it("names insufficient material", () => {
    const chess = new Chess("8/8/4k3/8/8/4K3/8/8 w - - 0 1");

    const outcome = describeOutcome(chess, "w");
    expect(outcome.over && outcome.reason).toMatch(/material/i);
  });

  it("names the fifty-move rule", () => {
    // Halfmove clock at 100 with a legal move available.
    const chess = new Chess("4k3/8/4r3/8/8/4R3/8/4K3 w - - 100 80");

    const outcome = describeOutcome(chess, "w");
    expect(outcome).toMatchObject({ over: true, result: "1/2-1/2" });
    expect(outcome.over && outcome.reason).toMatch(/fifty-move/i);
  });

  it("names threefold repetition", () => {
    // No castling rights in the FEN: with them, the first rook move would
    // silently change the position's identity and the cycle wouldn't repeat.
    const chess = new Chess("4k3/8/8/8/8/8/8/R3K3 w - - 0 1");
    // Shuffle rook and king back and forth until the start position recurs 3x.
    for (let i = 0; i < 2; i++) {
      chess.move("Ra2");
      chess.move("Ke7");
      chess.move("Ra1");
      chess.move("Ke8");
    }

    const outcome = describeOutcome(chess, "w");
    expect(outcome).toMatchObject({ over: true, result: "1/2-1/2" });
    expect(outcome.over && outcome.reason).toMatch(/repetition/i);
  });
});

describe("resignationOutcome", () => {
  it("gives the win to the opponent", () => {
    expect(resignationOutcome("w")).toMatchObject({ result: "0-1", forPlayer: "loss" });
    expect(resignationOutcome("b")).toMatchObject({ result: "1-0", forPlayer: "loss" });
  });
});
