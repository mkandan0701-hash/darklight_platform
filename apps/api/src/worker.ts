// BullMQ worker process — runs separately from the API server (src/index.ts)
// so long-running jobs (e.g. downloading + writing hundreds of thousands of
// puzzle rows) never compete with request handling. Run via `npm run worker`.
import type { Worker } from "bullmq";
import { requireTenantContext } from "@chessplay-clone/db";
import { createPuzzleImportWorker } from "./workers/puzzleImportWorker";
import { createClassroomScheduleMaterializeWorker } from "./workers/classroomScheduleMaterializeWorker";
import { createChesscomSyncWorker, createLichessSyncWorker } from "./workers/gameSyncWorker";
import { createGameAnalysisWorker } from "./workers/gameAnalysisWorker";
import {
  chesscomSyncQueue,
  classroomScheduleMaterializeQueue,
  lichessSyncQueue,
} from "./queues";

// Every tenant-scoped query in this process runs inside runWithTenant (socket
// handlers, webhooks, jobs), so one that doesn't is a bug: refuse it rather
// than fall back to tenantScope's presence-only check.
requireTenantContext(true);

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
  log(createLichessSyncWorker(), "lichess-sync"),
  log(createChesscomSyncWorker(), "chesscom-sync"),
  log(createGameAnalysisWorker(), "game-analysis"),
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

  // Staggered away from each other and from the 03:00 schedule sweep so the
  // three nightly jobs don't contend for the same worker at the same minute.
  await lichessSyncQueue.add(
    "sweep",
    {},
    { repeat: { pattern: "30 3 * * *" }, jobId: "lichess-sweep" }
  );
  await chesscomSyncQueue.add(
    "sweep",
    {},
    { repeat: { pattern: "0 4 * * *" }, jobId: "chesscom-sweep" }
  );

  console.log(
    `Worker process started, listening on queues: ${workers
      .map((w) => w.name)
      .join(", ")}`
  );
})();
