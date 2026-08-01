// One-off trigger for the puzzle-import job. Usage (with the worker process
// running via `npm run worker` in another terminal):
//   npm run import:puzzles
//   npm run import:puzzles -- --ratingMin=600 --ratingMax=2000 --maxCount=50000
import { puzzleImportQueue } from "../queues";
import type { PuzzleImportJobData } from "../workers/puzzleImportWorker";

function parseArgs(argv: string[]): PuzzleImportJobData {
  const data: PuzzleImportJobData = {};
  for (const arg of argv) {
    const match = /^--(ratingMin|ratingMax|maxCount)=(\d+)$/.exec(arg);
    if (match) data[match[1] as keyof PuzzleImportJobData] = Number(match[2]);
  }
  return data;
}

async function main() {
  const data = parseArgs(process.argv.slice(2));
  const job = await puzzleImportQueue.add("import", data);
  console.log(`Enqueued puzzle-import job ${job.id}`, data);
  await puzzleImportQueue.close();
}

main().catch((err) => {
  console.error("Failed to enqueue puzzle-import job:", err);
  process.exit(1);
});
