import { describe, expect, it } from "vitest";
import { classifySearchLine } from "./searchProtocol";

const INFO = "info depth 12 multipv 1 score cp 34 nodes 900 pv e2e4 e7e5";

describe("classifySearchLine — running search", () => {
  it("surfaces info lines", () => {
    const action = classifySearchLine(INFO, false);

    expect(action.kind).toBe("info");
    expect(action.kind === "info" && action.info.scoreCp).toBe(34);
  });

  it("completes on bestmove", () => {
    expect(classifySearchLine("bestmove e2e4 ponder e7e5", false)).toEqual({
      kind: "done",
      bestmove: "e2e4",
      ponder: "e7e5",
    });
  });

  it("completes with a null bestmove in a finished position", () => {
    expect(classifySearchLine("bestmove (none)", false)).toEqual({
      kind: "done",
      bestmove: null,
      ponder: null,
    });
  });

  it("ignores protocol chatter", () => {
    expect(classifySearchLine("readyok", false).kind).toBe("ignore");
    expect(classifySearchLine("info string NNUE evaluation", false).kind).toBe("ignore");
    expect(classifySearchLine("", false).kind).toBe("ignore");
  });
});

describe("classifySearchLine — superseded search", () => {
  // THE regression. Abandoning on the first line after a supersede — almost
  // always an `info` line — means the next search sends `position`/`go` while
  // the engine is still searching. UCI ignores those, the engine never
  // replies, and the analysis board hangs with no lines and no error.
  it("does NOT abandon on an info line — the engine is still searching", () => {
    expect(classifySearchLine(INFO, true).kind).toBe("ignore");
  });

  it("keeps ignoring info at any depth", () => {
    expect(classifySearchLine("info depth 1 score cp 5 pv d2d4", true).kind).toBe("ignore");
    expect(classifySearchLine("info depth 30 score mate 2 pv d1h5", true).kind).toBe("ignore");
  });

  it("abandons only once bestmove proves the engine is idle", () => {
    expect(classifySearchLine("bestmove e2e4", true)).toEqual({ kind: "abandon" });
    expect(classifySearchLine("bestmove (none)", true)).toEqual({ kind: "abandon" });
  });

  it("does not leak a result to the superseded caller", () => {
    // The move belongs to a position that is no longer on the board.
    const action = classifySearchLine("bestmove e2e4 ponder e7e5", true);
    expect(action).not.toHaveProperty("bestmove");
  });
});
