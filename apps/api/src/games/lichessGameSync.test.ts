import { describe, expect, it } from "vitest";
import { parseLichessGame, parseLichessNdjson } from "./lichessGameSync";

const won = JSON.stringify({
  id: "abc123",
  createdAt: 1757000000000,
  status: "mate",
  winner: "white",
  pgn: '[Event "Rated blitz"]\n\n1. e4 e5 2. Qh5 1-0',
});
const drawn = JSON.stringify({
  id: "def456",
  createdAt: 1757100000000,
  status: "draw",
  pgn: "1. e4 e5 1/2-1/2",
});
const aborted = JSON.stringify({
  id: "ghi789",
  createdAt: 1757200000000,
  status: "aborted",
  pgn: "1. e4",
});

describe("parseLichessGame", () => {
  it("maps a decisive game to PGN result notation", () => {
    expect(parseLichessGame(won)).toEqual({
      externalId: "abc123",
      pgn: '[Event "Rated blitz"]\n\n1. e4 e5 2. Qh5 1-0',
      playedAtUtc: new Date(1757000000000),
      result: "1-0",
    });
  });

  it("reads black's win from the winner field, not the PGN", () => {
    const line = JSON.stringify({ id: "x", createdAt: 1, status: "resign", winner: "black", pgn: "..." });
    expect(parseLichessGame(line)?.result).toBe("0-1");
  });

  it("treats a winner-less drawn status as a draw", () => {
    expect(parseLichessGame(drawn)?.result).toBe("1/2-1/2");
  });

  // An aborted game never happened — storing it would pad the student's
  // game count and skew any accuracy figure computed over their history.
  it("skips an aborted game rather than guessing a draw", () => {
    expect(parseLichessGame(aborted)).toBeNull();
  });

  it("skips rows missing an id, pgn, or timestamp", () => {
    expect(parseLichessGame(JSON.stringify({ createdAt: 1, pgn: "x", winner: "white" }))).toBeNull();
    expect(parseLichessGame(JSON.stringify({ id: "a", createdAt: 1, winner: "white" }))).toBeNull();
    expect(parseLichessGame(JSON.stringify({ id: "a", pgn: "x", winner: "white" }))).toBeNull();
  });

  it("returns null on malformed JSON instead of throwing", () => {
    expect(parseLichessGame("{not json")).toBeNull();
  });
});

describe("parseLichessNdjson", () => {
  // One bad line must not cost the student their whole synced history.
  it("keeps the parseable games and drops the rest", () => {
    const body = [won, "{broken", drawn, "", aborted].join("\n");
    const games = parseLichessNdjson(body);
    expect(games.map((g) => g.externalId)).toEqual(["abc123", "def456"]);
  });

  it("returns an empty array for an empty body", () => {
    expect(parseLichessNdjson("")).toEqual([]);
  });
});
