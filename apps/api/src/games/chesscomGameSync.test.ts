import { describe, expect, it } from "vitest";
import { archiveMonths, parseChesscomArchive, parseChesscomGame } from "./chesscomGameSync";

const base = { uuid: "u1", pgn: "1. e4 e5", end_time: 1757000000 };

describe("parseChesscomGame", () => {
  it("maps a white win", () => {
    expect(
      parseChesscomGame({ ...base, white: { result: "win" }, black: { result: "checkmated" } })
    ).toEqual({
      externalId: "u1",
      pgn: "1. e4 e5",
      // end_time is Unix seconds — the bug this pins is storing it as ms,
      // which would date every game to 1970.
      playedAtUtc: new Date(1757000000 * 1000),
      result: "1-0",
    });
  });

  it("maps a black win", () => {
    expect(
      parseChesscomGame({ ...base, white: { result: "resigned" }, black: { result: "win" } })?.result
    ).toBe("0-1");
  });

  it("maps a draw when both sides report a drawing reason", () => {
    expect(
      parseChesscomGame({ ...base, white: { result: "agreed" }, black: { result: "agreed" } })?.result
    ).toBe("1/2-1/2");
  });

  it("skips an abandoned game", () => {
    expect(
      parseChesscomGame({ ...base, white: { result: "abandoned" }, black: { result: "win" } })?.result
    ).toBe("0-1");
    expect(
      parseChesscomGame({ ...base, white: { result: "abandoned" }, black: { result: "abandoned" } })
    ).toBeNull();
  });

  // Guessing a draw for a result string Chess.com adds later would quietly
  // corrupt a student's record; skipping it is recoverable.
  it("skips an unrecognised result rather than guessing", () => {
    expect(
      parseChesscomGame({ ...base, white: { result: "something_new" }, black: { result: "other" } })
    ).toBeNull();
  });

  it("skips rows missing a uuid, pgn, or end_time", () => {
    expect(parseChesscomGame({ pgn: "x", end_time: 1, white: { result: "win" } })).toBeNull();
    expect(parseChesscomGame({ uuid: "u", end_time: 1, white: { result: "win" } })).toBeNull();
    expect(parseChesscomGame({ uuid: "u", pgn: "x", white: { result: "win" } })).toBeNull();
  });
});

describe("parseChesscomArchive", () => {
  it("parses the games array and drops unusable entries", () => {
    const body = {
      games: [
        { ...base, white: { result: "win" }, black: { result: "resigned" } },
        { uuid: "bad" },
      ],
    };
    expect(parseChesscomArchive(body).map((g) => g.externalId)).toEqual(["u1"]);
  });

  it("tolerates a response with no games array", () => {
    expect(parseChesscomArchive({})).toEqual([]);
    expect(parseChesscomArchive(null)).toEqual([]);
  });
});

describe("archiveMonths", () => {
  it("walks back from the current month", () => {
    expect(archiveMonths(new Date("2026-03-15T00:00:00Z"), 2)).toEqual([
      { year: 2026, month: 3 },
      { year: 2026, month: 2 },
    ]);
  });

  // The boundary a nightly job hits just after midnight on the 1st: last
  // month's games are still the most recent ones the student played.
  it("crosses a year boundary correctly", () => {
    expect(archiveMonths(new Date("2026-01-01T00:30:00Z"), 2)).toEqual([
      { year: 2026, month: 1 },
      { year: 2025, month: 12 },
    ]);
  });
});
