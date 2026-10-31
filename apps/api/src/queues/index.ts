import { Queue } from "bullmq";
import { DEFAULT_JOB_OPTIONS } from "@chessplay-clone/shared";
import { createBullConnection } from "../redis";

// BullMQ needs its own client (maxRetriesPerRequest: null for blocking reads).
// See src/redis.ts for why the Socket.io adapter and board store can't share it.
export const connection = createBullConnection();

// Retries with backoff for every queue; see DEFAULT_JOB_OPTIONS.

// One queue per class of async work, per CLAUDE.md §3 (async by default for
// expensive work) and §11 (never block a request thread on Stockfish/external
// APIs/email/WhatsApp sends).
export const gameAnalysisQueue = new Queue("game-analysis", { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
export const reportGenerationQueue = new Queue("report-generation", { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
// lichess-sync/chesscom-sync are for per-student *game* history sync (Wave 4),
// not the puzzle DB import below — different data, different job shape.
export const lichessSyncQueue = new Queue("lichess-sync", { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
export const chesscomSyncQueue = new Queue("chesscom-sync", { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
export const whatsappSendQueue = new Queue("whatsapp-send", { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
export const emailSendQueue = new Queue("email-send", { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
// Bulk-loads the global (non-tenant-scoped) Puzzle table from Lichess's CC0
// puzzle export. Triggered manually via `npm run import:puzzles`, not per-tenant.
export const puzzleImportQueue = new Queue("puzzle-import", { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
// Nightly sweep that materializes upcoming LiveSession rows from
// ClassroomScheduleSlot templates. Registered as a BullMQ repeatable job by
// the worker process itself (see workers/classroomScheduleMaterializeWorker.ts)
// rather than triggered manually — this backs "weekend-first classroom
// templates", on top of the immediate per-slot top-up that happens
// synchronously when a coach adds a slot (apps/web's addScheduleSlotAction).
export const classroomScheduleMaterializeQueue = new Queue(
  "classroom-schedule-materialize",
  { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS }
);

// Note: the "tournament-events" queue is deliberately *not* declared here.
// Nothing in this service produces onto it — apps/web does — and its consumer
// lives in the API server process rather than the worker process, because
// re-emitting into a Socket.io room needs the `io` instance. See
// socket/tournamentBroadcaster.ts, which owns the queue name.
