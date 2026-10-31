// BullMQ worker process — runs separately from the API server (src/index.ts)
// so long-running jobs (e.g. downloading + writing hundreds of thousands of
// puzzle rows) never compete with request handling. Run via `npm run worker`.
import type { Worker } from "bullmq";
import { createPuzzleImportWorker } from "./workers/puzzleImportWorker";
import { createClassroomScheduleMaterializeWorker } from "./workers/classroomScheduleMaterializeWorker";
import { classroomScheduleMaterializeQueue } from "./queues";

function log(worker: Worker, label: string) {
  worker.on("completed", (job, result) => {
    console.log(`[${label}] job ${job.id} completed:`, result);
  });
  worker.on("failed", (job, err) => {
    console.error(`[${label}] job ${job?.id} failed:`, err);
  });
  return worker;
}

const workers = [
  log(createPuzzleImportWorker(), "puzzle-import"),
  log(createClassroomScheduleMaterializeWorker(), "classroom-schedule-materialize"),
];

// Registering a repeatable job is idempotent: BullMQ dedupes on
// (queue, name, repeat options), so calling this on every worker start
// re-asserts the schedule rather than stacking up copies of it.
// commonjs (this project's module target) has no top-level await, hence the IIFE.
void (async () => {
  await classroomScheduleMaterializeQueue.add(
    "nightly-sweep",
    {},
    { repeat: { pattern: "0 3 * * *" }, jobId: "nightly-sweep" }
  );

  console.log(
    `Worker process started, listening on queues: ${workers
      .map((w) => w.name)
      .join(", ")}`
  );
})();
