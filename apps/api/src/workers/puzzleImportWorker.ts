import { Worker, type Job } from "bullmq";
import { connection } from "../queues";
import { importLichessPuzzles } from "../puzzles/lichessPuzzleImport";

export interface PuzzleImportJobData {
  ratingMin?: number;
  ratingMax?: number;
  maxCount?: number;
}

export function createPuzzleImportWorker(): Worker<PuzzleImportJobData> {
  return new Worker<PuzzleImportJobData>(
    "puzzle-import",
    async (job: Job<PuzzleImportJobData>) =>
      importLichessPuzzles({
        ratingMin: job.data.ratingMin,
        ratingMax: job.data.ratingMax,
        maxCount: job.data.maxCount,
        onProgress: (imported) => job.updateProgress({ imported }),
      }),
    { connection }
  );
}
