import { Worker, type Job } from "bullmq";
import { puzzleImportJobSchema, type PuzzleImportJobData } from "@chessplay-clone/shared";
import { connection } from "../queues";
import { parseJob } from "../queues/payloads";
import { importLichessPuzzles } from "../puzzles/lichessPuzzleImport";

export type { PuzzleImportJobData };

export function createPuzzleImportWorker(): Worker<PuzzleImportJobData> {
  return new Worker<PuzzleImportJobData>(
    "puzzle-import",
    async (job: Job<PuzzleImportJobData>) => {
      const data = parseJob(puzzleImportJobSchema, job.data, "puzzle-import");
      return importLichessPuzzles({
        ratingMin: data.ratingMin,
        ratingMax: data.ratingMax,
        maxCount: data.maxCount,
        onProgress: (imported) => job.updateProgress({ imported }),
      });
    },
    { connection }
  );
}
