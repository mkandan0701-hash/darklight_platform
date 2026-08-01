// BullMQ worker process — runs separately from the API server (src/index.ts)
// so long-running jobs (e.g. downloading + writing hundreds of thousands of
// puzzle rows) never compete with request handling. Run via `npm run worker`.
import { createPuzzleImportWorker } from "./workers/puzzleImportWorker";

const puzzleImportWorker = createPuzzleImportWorker();

puzzleImportWorker.on("completed", (job, result) => {
  console.log(`[puzzle-import] job ${job.id} completed:`, result);
});
puzzleImportWorker.on("failed", (job, err) => {
  console.error(`[puzzle-import] job ${job?.id} failed:`, err);
});

console.log("Worker process started, listening on queues: puzzle-import");
