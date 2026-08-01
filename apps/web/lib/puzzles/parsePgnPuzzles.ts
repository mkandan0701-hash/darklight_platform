// Parses a coach-uploaded PGN file into puzzles: each game in the file is
// one puzzle, using the standard convention (ChessBase/Lichess study
// exports) of a `[FEN "..."]` header for the puzzle's starting position and
// the mainline moves as the solution. Pure/no I/O so it's unit-testable
// without a real file upload.

import { Chess } from "chess.js";

export interface ParsedPuzzle {
  fen: string;
  /** Space-separated UCI solution moves, e.g. "e2e4 e7e5" — same format as the Lichess import. */
  moves: string;
}

export interface PuzzleParseError {
  /** 1-based index into the uploaded file's games, for a "game 3: ..." style message. */
  gameIndex: number;
  message: string;
}

export interface ParsePgnPuzzlesResult {
  puzzles: ParsedPuzzle[];
  errors: PuzzleParseError[];
}

export const MAX_GAMES_PER_UPLOAD = 500;

/**
 * Splits a multi-game PGN file into individual game blocks. Each game in a
 * well-formed PGN starts with an `[Event ...]` tag, so a new match of that
 * tag at the start of a line marks the next game's boundary. Files with no
 * `[Event` tag at all are treated as a single game (covers a puzzle pasted
 * without a full tag roster).
 */
export function splitPgnGames(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const eventTagPositions: number[] = [];
  const eventTagRegex = /^\[Event /gm;
  let match: RegExpExecArray | null;
  while ((match = eventTagRegex.exec(trimmed))) {
    eventTagPositions.push(match.index);
  }
  if (eventTagPositions.length === 0) return [trimmed];

  return eventTagPositions.map((start, i) => {
    const end = i + 1 < eventTagPositions.length ? eventTagPositions[i + 1] : trimmed.length;
    return trimmed.slice(start, end).trim();
  });
}

export function parsePgnPuzzles(pgnText: string): ParsePgnPuzzlesResult {
  const games = splitPgnGames(pgnText);
  const puzzles: ParsedPuzzle[] = [];
  const errors: PuzzleParseError[] = [];

  const gamesToProcess = games.slice(0, MAX_GAMES_PER_UPLOAD);
  if (games.length > MAX_GAMES_PER_UPLOAD) {
    errors.push({
      gameIndex: MAX_GAMES_PER_UPLOAD + 1,
      message: `File has ${games.length} games — only the first ${MAX_GAMES_PER_UPLOAD} were read. Split large files into smaller uploads.`,
    });
  }

  gamesToProcess.forEach((gameText, i) => {
    const gameIndex = i + 1;
    const chess = new Chess();

    try {
      chess.loadPgn(gameText);
    } catch (err) {
      errors.push({
        gameIndex,
        message: `Couldn't read this game's moves: ${(err as Error).message}`,
      });
      return;
    }

    const startingFen = chess.header().FEN;
    if (!startingFen) {
      errors.push({
        gameIndex,
        message: 'Missing a [FEN "..."] tag — every puzzle needs a starting position.',
      });
      return;
    }

    const solutionMoves = chess.history({ verbose: true });
    if (solutionMoves.length === 0) {
      errors.push({
        gameIndex,
        message: "No solution moves found after the starting position.",
      });
      return;
    }

    puzzles.push({
      fen: startingFen,
      moves: solutionMoves.map((move) => `${move.from}${move.to}${move.promotion ?? ""}`).join(" "),
    });
  });

  return { puzzles, errors };
}

/**
 * Re-checks a parsed puzzle's FEN and solution moves are actually legal.
 * Used server-side before committing an import — never trust client-supplied
 * FEN/moves blindly, same principle as live-session move validation.
 */
export function isValidPuzzle(puzzle: ParsedPuzzle): boolean {
  const chess = new Chess();
  try {
    chess.load(puzzle.fen);
  } catch {
    return false;
  }

  for (const uci of puzzle.moves.split(" ")) {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.slice(4) || undefined;
    try {
      if (!chess.move({ from, to, promotion })) return false;
    } catch {
      return false;
    }
  }
  return true;
}
