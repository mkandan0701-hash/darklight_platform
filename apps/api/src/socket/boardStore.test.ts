import { describe, expect, it } from "vitest";
import { boardKey, createBoardStore, START_FEN } from "./boardStore";
import { createFakeRedis } from "./fakeRedis";

const AFTER_E4 =
  "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
const AFTER_E4_E5 =
  "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2";

function setup() {
  const redis = createFakeRedis();
  return { redis, store: createBoardStore(redis as never) };
}

describe("boardKey", () => {
  it("keeps the shared and reference boards in separate keys", () => {
    expect(boardKey("ls_1", "shared")).toBe("session:ls_1:fen");
    expect(boardKey("ls_1", "ref")).toBe("session:ls_1:ref-fen");
  });
});

describe("getFen", () => {
  it("returns the start position when nothing has been stored", async () => {
    const { store } = setup();
    expect(await store.getFen("ls_1")).toBe(START_FEN);
  });

  it("reads back what was written", async () => {
    const { store } = setup();
    await store.setFen("ls_1", AFTER_E4);
    expect(await store.getFen("ls_1")).toBe(AFTER_E4);
  });

  it("does not leak the reference board into the shared board", async () => {
    const { store } = setup();
    await store.setFen("ls_1", AFTER_E4, "ref");
    expect(await store.getFen("ls_1")).toBe(START_FEN);
    expect(await store.getFen("ls_1", "ref")).toBe(AFTER_E4);
  });
});

describe("compareAndSetFen", () => {
  it("accepts a first move, which CASes against the start position", async () => {
    const { store } = setup();
    expect(await store.compareAndSetFen("ls_1", START_FEN, AFTER_E4)).toBe(true);
    expect(await store.getFen("ls_1")).toBe(AFTER_E4);
  });

  it("rejects a first move whose expected position isn't the start", async () => {
    const { store } = setup();
    expect(await store.compareAndSetFen("ls_1", AFTER_E4, AFTER_E4_E5)).toBe(false);
    expect(await store.getFen("ls_1")).toBe(START_FEN);
  });

  it("accepts a move built on the current position", async () => {
    const { store } = setup();
    await store.setFen("ls_1", AFTER_E4);
    expect(await store.compareAndSetFen("ls_1", AFTER_E4, AFTER_E4_E5)).toBe(true);
  });

  // Two clients moving at the same instant both read the same FEN. Without the
  // compare-and-set the second write would land on top of the first, dropping a
  // move and leaving the room's clients disagreeing about the position.
  it("lets only the first of two concurrent moves win", async () => {
    const { store } = setup();
    await store.setFen("ls_1", AFTER_E4);

    const first = await store.compareAndSetFen("ls_1", AFTER_E4, AFTER_E4_E5);
    const second = await store.compareAndSetFen(
      "ls_1",
      AFTER_E4,
      "rnbqkbnr/pppppppp/8/8/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 1"
    );

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(await store.getFen("ls_1")).toBe(AFTER_E4_E5);
  });
});

describe("clearFen", () => {
  it("resets the board back to the start position", async () => {
    const { store } = setup();
    await store.setFen("ls_1", AFTER_E4);
    await store.clearFen("ls_1");
    expect(await store.getFen("ls_1")).toBe(START_FEN);
  });
});
