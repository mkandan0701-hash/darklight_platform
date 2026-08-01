// Imports Lichess's CC0 puzzle export (lichess_db_puzzle.csv.zst) into the
// global (non-tenant-scoped) Puzzle table. See packages/db/src/index.ts for
// why Puzzle is exempt from tenant scoping.
//
// The export is a multi-GB zstd-compressed CSV once decompressed, so this
// streams the download, decompresses it chunk-by-chunk (fzstd, pure JS —
// no native build step), and batch-writes rows as they're parsed rather
// than buffering the whole file in memory.
//
// CSV columns: PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
//
// Lichess's Moves column starts with the "opponent" setup move: FEN is the
// position before that move, and it must be applied before the puzzle's
// actual solution begins. This is normalized away below so that every
// Puzzle row in this app (Lichess-imported or coach-uploaded, see
// apps/web/lib/puzzles/parsePgnPuzzles.ts) shares one contract: `fen` is the
// position the solver moves from first, and `moves` is the solution only.

import { Chess } from "chess.js";
import { Decompress } from "fzstd";
import { prisma } from "@chessplay-clone/db";

export const LICHESS_PUZZLE_CSV_URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst";

export interface PuzzleImportRow {
  lichessId: string;
  fen: string;
  moves: string;
  rating: number;
  themes: string[];
}

/**
 * Applies the Lichess CSV's leading opponent setup move to its FEN, returning
 * the resulting position plus the remaining (actual solution) moves. Returns
 * null if the setup move can't legally be applied — such a row is unusable
 * and should be skipped, same posture as apps/web's isValidPuzzle.
 */
function applySetupMove(fen: string, moves: string): { fen: string; moves: string } | null {
  const [setupMove, ...solutionMoves] = moves.split(" ");
  if (!setupMove) return null;

  const chess = new Chess();
  try {
    chess.load(fen);
    const from = setupMove.slice(0, 2);
    const to = setupMove.slice(2, 4);
    const promotion = setupMove.slice(4) || undefined;
    if (!chess.move({ from, to, promotion })) return null;
  } catch {
    return null;
  }

  if (solutionMoves.length === 0) return null;
  return { fen: chess.fen(), moves: solutionMoves.join(" ") };
}

/**
 * Parses one CSV line into a puzzle row, or null if the line doesn't parse
 * into a usable puzzle (this also naturally filters out the header row,
 * since "Rating" isn't a finite number).
 */
export function parsePuzzleLine(line: string): PuzzleImportRow | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const [lichessId, rawFen, rawMoves, ratingRaw, , , , themesRaw] = trimmed.split(",");
  const rating = Number(ratingRaw);
  if (!lichessId || !rawFen || !rawMoves || !Number.isFinite(rating)) return null;

  const normalized = applySetupMove(rawFen, rawMoves);
  if (!normalized) return null;

  return {
    lichessId,
    fen: normalized.fen,
    moves: normalized.moves,
    rating,
    themes: themesRaw ? themesRaw.split(" ").filter(Boolean) : [],
  };
}

export interface ImportPuzzlesOptions {
  /** Default 400 — puzzles below this are rarely useful for classroom homework. */
  ratingMin?: number;
  /** Default 2400 — above the range this product's students/coaches need. */
  ratingMax?: number;
  /** Stop once this many puzzles have been imported (undefined = no limit). */
  maxCount?: number;
  batchSize?: number;
  onProgress?: (imported: number) => void | Promise<void>;
}

const DEFAULT_RATING_MIN = 400;
const DEFAULT_RATING_MAX = 2400;
const DEFAULT_BATCH_SIZE = 1000;

/**
 * Batches and writes already-split CSV lines into the Puzzle table.
 * Separated from the download/decompress step below so it can be unit
 * tested without a network call or a real .zst fixture.
 */
export async function importPuzzleLines(
  lines: AsyncIterable<string> | Iterable<string>,
  options: ImportPuzzlesOptions = {}
): Promise<{ imported: number; skipped: number }> {
  const {
    ratingMin = DEFAULT_RATING_MIN,
    ratingMax = DEFAULT_RATING_MAX,
    maxCount,
    batchSize = DEFAULT_BATCH_SIZE,
    onProgress,
  } = options;

  let imported = 0;
  let skipped = 0;
  let batch: PuzzleImportRow[] = [];

  async function flush() {
    if (batch.length === 0) return;
    const result = await prisma.puzzle.createMany({ data: batch, skipDuplicates: true });
    imported += result.count;
    skipped += batch.length - result.count;
    batch = [];
    await onProgress?.(imported);
  }

  for await (const line of lines) {
    if (maxCount !== undefined && imported + batch.length >= maxCount) break;

    const row = parsePuzzleLine(line);
    if (!row || row.rating < ratingMin || row.rating > ratingMax) {
      skipped += 1;
      continue;
    }

    batch.push(row);
    if (batch.length >= batchSize) await flush();
  }
  await flush();

  return { imported, skipped };
}

/** Downloads + decompresses the Lichess puzzle export, yielding one CSV line at a time. */
export async function* streamLichessPuzzleCsvLines(signal?: AbortSignal): AsyncGenerator<string> {
  const response = await fetch(LICHESS_PUZZLE_CSV_URL, { signal });
  if (!response.ok || !response.body) {
    throw new Error(
      `Failed to download Lichess puzzle export: ${response.status} ${response.statusText}`
    );
  }

  const decoder = new TextDecoder();
  let leftover = "";
  const decompressedChunks: Uint8Array[] = [];
  const decompressor = new Decompress((chunk) => {
    decompressedChunks.push(chunk);
  });

  function drainDecompressedLines(): string[] {
    while (decompressedChunks.length > 0) {
      leftover += decoder.decode(decompressedChunks.shift()!, { stream: true });
    }
    const out: string[] = [];
    let newlineIdx: number;
    while ((newlineIdx = leftover.indexOf("\n")) !== -1) {
      out.push(leftover.slice(0, newlineIdx));
      leftover = leftover.slice(newlineIdx + 1);
    }
    return out;
  }

  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      decompressor.push(value, false);
      yield* drainDecompressedLines();
    }
    decompressor.push(new Uint8Array(0), true);
    yield* drainDecompressedLines();
    leftover += decoder.decode();
    if (leftover.trim()) yield leftover;
  } finally {
    reader.releaseLock();
  }
}

export async function importLichessPuzzles(
  options: ImportPuzzlesOptions = {}
): Promise<{ imported: number; skipped: number }> {
  const controller = new AbortController();
  try {
    return await importPuzzleLines(streamLichessPuzzleCsvLines(controller.signal), options);
  } finally {
    // No-op if the stream already finished on its own; stops the download
    // if importPuzzleLines broke out early because maxCount was reached.
    controller.abort();
  }
}
