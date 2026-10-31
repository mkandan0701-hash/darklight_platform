import { describe, expect, it } from "vitest";
import { describeGame, parsePgn, validatePgn } from "./parsePgn";

const Q = String.fromCharCode(34);
const tag = (name: string, value: string) => `[${name} ${Q}${value}${Q}]`;

const GAME_ONE = [
  tag("Event", "World Championship"),
  tag("Site", "Dubai UAE"),
  tag("Date", "2021.12.03"),
  tag("Round", "6"),
  tag("White", "Nepomniachtchi, Ian"),
  tag("Black", "Carlsen, Magnus"),
  tag("Result", "0-1"),
  tag("ECO", "C88"),
  "",
  "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 0-1",
].join("\n");

const GAME_TWO = [
  tag("Event", "Tata Steel"),
  tag("White", "Giri, Anish"),
  tag("Black", "Firouzja, Alireza"),
  tag("Result", "1/2-1/2"),
  "",
  "1. d4 Nf6 2. c4 e6 1/2-1/2",
].join("\n");

describe("parsing one game", () => {
  it("reads the Seven Tag Roster and ECO", () => {
    const { games, gameCount } = parsePgn(GAME_ONE);
    expect(gameCount).toBe(1);
    expect(games[0].headers).toMatchObject({
      Event: "World Championship",
      Site: "Dubai UAE",
      Date: "2021.12.03",
      Round: "6",
      White: "Nepomniachtchi, Ian",
      Black: "Carlsen, Magnus",
      Result: "0-1",
      ECO: "C88",
    });
  });

  it("keeps the movetext separate from the headers", () => {
    const { games } = parsePgn(GAME_ONE);
    expect(games[0].movetext).toBe("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 0-1");
  });
});

describe("counting games", () => {
  it("splits on Event, the tag every game must carry", () => {
    const { gameCount, games } = parsePgn(`${GAME_ONE}\n\n${GAME_TWO}`);
    expect(gameCount).toBe(2);
    expect(games[1].headers.White).toBe("Giri, Anish");
    expect(games.map((g) => g.index)).toEqual([1, 2]);
  });

  it("counts a long file correctly", () => {
    const many = Array.from({ length: 40 }, () => GAME_TWO).join("\n\n");
    expect(parsePgn(many).gameCount).toBe(40);
  });

  // Annotated games are routinely wrapped with blank lines inside the moves.
  // Splitting on blank lines rather than on [Event] would count this as three.
  it("does not split a game whose movetext contains blank lines", () => {
    const annotated = [
      tag("Event", "Annotated"),
      tag("White", "A"),
      tag("Black", "B"),
      "",
      "1. e4 {A good move.}",
      "",
      "1... e5 {Symmetry.}",
      "",
      "2. Nf3 1-0",
    ].join("\n");
    const { gameCount, games } = parsePgn(annotated);
    expect(gameCount).toBe(1);
    expect(games[0].movetext).toContain("A good move.");
    expect(games[0].movetext).toContain("Symmetry.");
  });
});

describe("tolerance", () => {
  it("handles Windows line endings", () => {
    const crlf = GAME_ONE.split("\n").join("\r\n");
    expect(parsePgn(crlf).gameCount).toBe(1);
    expect(parsePgn(crlf).games[0].headers.White).toBe("Nepomniachtchi, Ian");
  });

  // Rejecting a file for carrying an unusual tag would turn away most real
  // exports — ChessBase, Lichess and SCID all add their own.
  it("keeps unknown tags instead of refusing the file", () => {
    const odd = [
      tag("Event", "Club night"),
      tag("WhiteTeamCountry", "IND"),
      tag("Annotator", "Coach"),
      tag("SomethingNobodyStandardised", "42"),
      "",
      "1. e4 *",
    ].join("\n");
    const { games, gameCount } = parsePgn(odd);
    expect(gameCount).toBe(1);
    expect(games[0].headers.Annotator).toBe("Coach");
    expect(games[0].headers.SomethingNobodyStandardised).toBe("42");
  });

  it("reads a tag whose value contains brackets", () => {
    const bracketed = [tag("Event", "Open [Section A]"), "", "1. e4 *"].join("\n");
    expect(parsePgn(bracketed).games[0].headers.Event).toBe("Open [Section A]");
  });

  it("accepts a game with no Result", () => {
    const unfinished = [tag("Event", "Adjourned"), tag("White", "A"), "", "1. e4 e5"].join("\n");
    const result = validatePgn(unfinished);
    expect(result.ok).toBe(true);
    expect(result.gameCount).toBe(1);
  });

  it("notes a game with no moves without discarding it", () => {
    const headersOnly = [tag("Event", "Scheduled"), tag("White", "A"), tag("Black", "B")].join("\n");
    const parsed = parsePgn(headersOnly);
    expect(parsed.gameCount).toBe(1);
    expect(parsed.warnings.join(" ")).toContain("no moves");
  });

  // One broken game among fifty is still forty-nine the coach wants kept.
  it("keeps the good games when one is malformed", () => {
    const mixed = `${GAME_ONE}\n\n[Event\n\n${GAME_TWO}`;
    const parsed = parsePgn(mixed);
    expect(parsed.gameCount).toBeGreaterThanOrEqual(2);
    expect(parsed.games.some((g) => g.headers.White === "Giri, Anish")).toBe(true);
  });
});

describe("validatePgn", () => {
  it("accepts a real file", () => {
    expect(validatePgn(GAME_ONE)).toMatchObject({ ok: true, gameCount: 1 });
  });

  it("rejects an empty file with a reason", () => {
    expect(validatePgn("   \n  ")).toMatchObject({ ok: false, gameCount: 0 });
    expect(validatePgn("").error).toMatch(/empty/i);
  });

  it("rejects a file that is not chess at all", () => {
    const result = validatePgn("Dear coach,\n\nPlease find the games attached.\n");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no chess games/i);
  });

  // Headerless games are legal — an engine dump, a position pasted from chat —
  // so the test above must reject prose without also rejecting these.
  it("still accepts a headerless game that is real movetext", () => {
    expect(validatePgn("1. e4 e5 2. Nf3 Nc6 1-0")).toMatchObject({ ok: true, gameCount: 1 });
  });

  it("ignores a covering note sitting above the games", () => {
    const withPreamble = `Games from Saturday, coach.\n\n${GAME_ONE}`;
    expect(validatePgn(withPreamble)).toMatchObject({ ok: true, gameCount: 1 });
  });
});

describe("parsing never rewrites", () => {
  // The whole reason this does not round-trip through chess.js: comments,
  // variations and NAGs survive because the text is never regenerated.
  it("leaves variations, comments and NAGs in the movetext", () => {
    const rich = [
      tag("Event", "Repertoire"),
      "",
      "1. e4 e5 2. Nf3 $1 {Best by test} (2. f4?! exf4 {the King's Gambit}) 2... Nc6 *",
    ].join("\n");
    const { movetext } = parsePgn(rich).games[0];
    expect(movetext).toContain("$1");
    expect(movetext).toContain("{Best by test}");
    expect(movetext).toContain("(2. f4?! exf4 {the King's Gambit})");
  });
});

describe("describeGame", () => {
  it("names both players and the result", () => {
    expect(describeGame(parsePgn(GAME_ONE).games[0])).toBe(
      "Nepomniachtchi, Ian vs Carlsen, Magnus · 0-1"
    );
  });

  it("omits an unfinished result rather than printing a star", () => {
    const ongoing = [tag("Event", "x"), tag("White", "A"), tag("Black", "B"), tag("Result", "*"), "", "1. e4 *"].join("\n");
    expect(describeGame(parsePgn(ongoing).games[0])).toBe("A vs B");
  });

  it("falls back to question marks for missing players", () => {
    const anon = [tag("Event", "x"), "", "1. e4 *"].join("\n");
    expect(describeGame(parsePgn(anon).games[0])).toBe("? vs ?");
  });
});
