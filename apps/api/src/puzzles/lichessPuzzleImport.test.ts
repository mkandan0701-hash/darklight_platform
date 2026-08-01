import { beforeEach, describe, expect, it, vi } from "vitest";
import { importPuzzleLines, parsePuzzleLine } from "./lichessPuzzleImport";

const puzzleCreateMany = vi.fn();

vi.mock("@chessplay-clone/db", () => ({
  prisma: {
    puzzle: { createMany: (...args: unknown[]) => puzzleCreateMany(...args) },
  },
}));

const HEADER =
  "PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags";
const ROW_A =
  "00008,r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24,f2g3 e6e7 b2b1 b3c1 b1c1 h6c1,1913,75,94,1002,mate mateIn2 middlegame short,https://lichess.org/787zsVup/black#48,";
const ROW_B_LOW_RATING =
  "0000D,5rk1/1p3ppp/pq3b2/8/8/1P1Q1N2/P4PPP/3R2K1 w - - 2 27,d3d6 f8d8 d6d8 f6d8,900,80,90,500,advantage,url,";
const MALFORMED = "not,enough";

describe("parsePuzzleLine", () => {
  it("parses a well-formed row, applying the leading setup move so fen/moves match the app's solution-only convention", () => {
    expect(parsePuzzleLine(ROW_A)).toEqual({
      lichessId: "00008",
      fen: "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2b1/PqP3PP/7K w - - 0 25",
      moves: "e6e7 b2b1 b3c1 b1c1 h6c1",
      rating: 1913,
      themes: ["mate", "mateIn2", "middlegame", "short"],
    });
  });

  it("applies the setup move for a row where White (not Black) is the setup-moving side", () => {
    expect(parsePuzzleLine(ROW_B_LOW_RATING)).toEqual({
      lichessId: "0000D",
      fen: "5rk1/1p3ppp/pq1Q1b2/8/8/1P3N2/P4PPP/3R2K1 b - - 3 27",
      moves: "f8d8 d6d8 f6d8",
      rating: 900,
      themes: ["advantage"],
    });
  });

  it("returns null for the CSV header row", () => {
    expect(parsePuzzleLine(HEADER)).toBeNull();
  });

  it("returns null for a malformed row missing required columns", () => {
    expect(parsePuzzleLine(MALFORMED)).toBeNull();
  });

  it("returns null for an empty or blank line", () => {
    expect(parsePuzzleLine("")).toBeNull();
    expect(parsePuzzleLine("   ")).toBeNull();
  });

  it("returns null when the setup move can't legally be applied to the FEN", () => {
    const illegalSetup =
      "99999,r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24,a1a2 e6e7,1500,75,94,1002,short,url,";
    expect(parsePuzzleLine(illegalSetup)).toBeNull();
  });

  it("returns null when the row has only a setup move and no solution moves left", () => {
    const setupOnly =
      "88888,r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24,f2g3,1500,75,94,1002,short,url,";
    expect(parsePuzzleLine(setupOnly)).toBeNull();
  });
});

describe("importPuzzleLines", () => {
  beforeEach(() => {
    puzzleCreateMany.mockReset();
    puzzleCreateMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({
      count: data.length,
    }));
  });

  it("writes valid in-range rows and counts out-of-range/malformed lines as skipped", async () => {
    const result = await importPuzzleLines([HEADER, ROW_A, ROW_B_LOW_RATING, MALFORMED], {
      ratingMin: 1000,
      ratingMax: 2400,
    });

    expect(result).toEqual({ imported: 1, skipped: 3 });
    expect(puzzleCreateMany).toHaveBeenCalledWith({
      data: [
        {
          lichessId: "00008",
          fen: "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2b1/PqP3PP/7K w - - 0 25",
          moves: "e6e7 b2b1 b3c1 b1c1 h6c1",
          rating: 1913,
          themes: ["mate", "mateIn2", "middlegame", "short"],
        },
      ],
      skipDuplicates: true,
    });
  });

  it("flushes in batches according to batchSize", async () => {
    await importPuzzleLines([ROW_A, ROW_A, ROW_A], {
      ratingMin: 0,
      ratingMax: 9999,
      batchSize: 2,
    });
    // batch of 2, then a final flush of the remaining 1
    expect(puzzleCreateMany).toHaveBeenCalledTimes(2);
  });

  it("stops pulling more lines once maxCount is reached", async () => {
    const result = await importPuzzleLines([ROW_A, ROW_A, ROW_A, ROW_A], {
      ratingMin: 0,
      ratingMax: 9999,
      maxCount: 2,
    });
    expect(result.imported).toBe(2);
  });

  it("counts createMany's skipDuplicates misses as skipped, not imported", async () => {
    puzzleCreateMany.mockResolvedValueOnce({ count: 0 });
    const result = await importPuzzleLines([ROW_A], { ratingMin: 0, ratingMax: 9999 });
    expect(result).toEqual({ imported: 0, skipped: 1 });
  });

  it("calls onProgress with the running imported total after each flush", async () => {
    const onProgress = vi.fn();
    await importPuzzleLines([ROW_A, ROW_A], {
      ratingMin: 0,
      ratingMax: 9999,
      batchSize: 1,
      onProgress,
    });
    expect(onProgress).toHaveBeenNthCalledWith(1, 1);
    expect(onProgress).toHaveBeenNthCalledWith(2, 2);
  });
});
