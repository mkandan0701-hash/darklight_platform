// Reading a PGN file well enough to describe it, without ever rewriting it.
//
// The governing rule: the stored text is the uploaded text, byte for byte.
// Nothing here re-serializes a game. chess.js can load PGN, but a round trip
// through any parser drops comments, variations, NAGs and nonstandard tags —
// and an annotated repertoire is somebody's work, not a move list. So this
// reads headers and counts games off the raw text and leaves the file alone.
//
// It is also deliberately permissive. A file with an unusual tag, a missing
// Result, or one malformed game among fifty is still a file the coach wants
// kept; the parser reports what it could read rather than refusing the upload.

/** The seven tags the PGN standard calls the Seven Tag Roster, plus ECO. */
export interface PgnHeaders {
  Event?: string;
  Site?: string;
  Date?: string;
  Round?: string;
  White?: string;
  Black?: string;
  Result?: string;
  ECO?: string;
  [tag: string]: string | undefined;
}

export interface PgnGame {
  /** 1-based, in file order. */
  index: number;
  headers: PgnHeaders;
  /** Everything after the header block — moves, comments and all. */
  movetext: string;
}

export interface PgnParseResult {
  games: PgnGame[];
  gameCount: number;
  /** Non-fatal notes: a game with no headers, a tag line that would not read. */
  warnings: string[];
}

const TAG_OPEN = "[";
const TAG_CLOSE = "]";
const QUOTE = String.fromCharCode(34);

/**
 * One header line: `[White "Carlsen, Magnus"]`.
 *
 * Hand-parsed rather than matched, because a tag value may itself contain
 * brackets, and a value is quoted so the closing bracket of the line is the
 * one after the closing quote — not the first one encountered.
 */
function parseTagLine(line: string): { tag: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith(TAG_OPEN) || !trimmed.endsWith(TAG_CLOSE)) return null;

  const body = trimmed.slice(1, -1).trim();
  const firstQuote = body.indexOf(QUOTE);
  if (firstQuote === -1) return null;

  const tag = body.slice(0, firstQuote).trim();
  const lastQuote = body.lastIndexOf(QUOTE);
  if (tag.length === 0 || lastQuote <= firstQuote) return null;

  return { tag, value: body.slice(firstQuote + 1, lastQuote) };
}

/** A move number ("12." or "12 ."), the one thing all movetext has. */
const MOVE_NUMBER = /\d+\s*\./;
const RESULT_TOKENS = ["1-0", "0-1", "1/2-1/2"];

/**
 * Whether a chunk with no header tags is plausibly a game.
 *
 * Headerless games are legal and do occur — an engine dump, a position pasted
 * from a chat. But without this check any text file at all parses as one game,
 * and an email with a PGN attachment forgotten would upload as chess.
 */
function looksLikeMovetext(text: string): boolean {
  if (MOVE_NUMBER.test(text)) return true;
  return RESULT_TOKENS.some((token) => text.includes(token));
}

/** True for a line that opens a new game, i.e. an `[Event ...]` tag. */
function startsNewGame(line: string): boolean {
  const trimmed = line.trimStart();
  if (!trimmed.startsWith(TAG_OPEN)) return false;
  const parsed = parseTagLine(trimmed);
  return parsed?.tag === "Event";
}

/**
 * Splits a file into games and reads each one's headers.
 *
 * Games are separated at `[Event ...]`, which is how every PGN writer in
 * practice begins a game — the standard requires Event in the Seven Tag
 * Roster. Splitting on blank lines instead would break any file whose
 * movetext is blank-line wrapped, which is common in annotated games.
 */
export function parsePgn(text: string): PgnParseResult {
  // Normalize only for *reading*. The caller stores the original.
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  const chunks: string[][] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    if (startsNewGame(line)) {
      if (current) chunks.push(current);
      current = [line];
      continue;
    }
    if (current) {
      current.push(line);
      continue;
    }
    // Content before the first [Event] — a header comment, or a headerless
    // game. Kept as its own chunk rather than discarded.
    if (line.trim().length > 0) current = [line];
  }
  if (current) chunks.push(current);

  const warnings: string[] = [];
  const games: PgnGame[] = [];

  chunks.forEach((chunk, i) => {
    const headers: PgnHeaders = {};
    let movetextFrom = 0;
    let sawTag = false;

    for (let l = 0; l < chunk.length; l++) {
      const line = chunk[l];
      if (line.trim().length === 0) {
        // A blank line ends the header block only once a tag has been seen.
        if (sawTag) {
          movetextFrom = l + 1;
          break;
        }
        continue;
      }
      const parsed = parseTagLine(line);
      if (!parsed) {
        movetextFrom = l;
        break;
      }
      headers[parsed.tag] = parsed.value;
      sawTag = true;
      movetextFrom = l + 1;
    }

    const movetext = chunk.slice(movetextFrom).join("\n").trim();
    // A chunk with neither tags nor anything resembling moves is not a game —
    // it is a covering note, a stray signature, or the wrong file entirely.
    if (!sawTag && !looksLikeMovetext(movetext)) return;
    if (!sawTag) warnings.push(`Game ${i + 1} has no header tags.`);
    if (movetext.length === 0) warnings.push(`Game ${i + 1} has no moves.`);

    games.push({ index: games.length + 1, headers, movetext });
  });

  return { games, gameCount: games.length, warnings };
}

export interface PgnValidation {
  ok: boolean;
  gameCount: number;
  warnings: string[];
  error?: string;
}

/**
 * Whether this text is usable as a PGN file.
 *
 * The only hard failures are empty content and content with nothing that reads
 * as a game at all. Everything softer is a warning, so a file with one broken
 * game among fifty uploads with a note rather than being turned away.
 */
export function validatePgn(text: string): PgnValidation {
  if (text.trim().length === 0) {
    return { ok: false, gameCount: 0, warnings: [], error: "The file is empty." };
  }

  const parsed = parsePgn(text);
  if (parsed.gameCount === 0) {
    return {
      ok: false,
      gameCount: 0,
      warnings: parsed.warnings,
      error: "No chess games were found in this file. A PGN file holds one or more games.",
    };
  }

  return { ok: true, gameCount: parsed.gameCount, warnings: parsed.warnings };
}

/** A one-line description of a game, for a list row. */
export function describeGame(game: PgnGame): string {
  const white = game.headers.White ?? "?";
  const black = game.headers.Black ?? "?";
  const result = game.headers.Result;
  const players = `${white} vs ${black}`;
  return result && result !== "*" ? `${players} · ${result}` : players;
}
