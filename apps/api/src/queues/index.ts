import { Queue } from "bullmq";
import IORedis from "ioredis";

export const connection = new IORedis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  { maxRetriesPerRequest: null }
);

// One queue per class of async work, per CLAUDE.md §3 (async by default for
// expensive work) and §11 (never block a request thread on Stockfish/external
// APIs/email/WhatsApp sends).
export const gameAnalysisQueue = new Queue("game-analysis", { connection });
export const reportGenerationQueue = new Queue("report-generation", { connection });
// lichess-sync/chesscom-sync are for per-student *game* history sync (Wave 4),
// not the puzzle DB import below — different data, different job shape.
export const lichessSyncQueue = new Queue("lichess-sync", { connection });
export const chesscomSyncQueue = new Queue("chesscom-sync", { connection });
export const whatsappSendQueue = new Queue("whatsapp-send", { connection });
export const emailSendQueue = new Queue("email-send", { connection });
// Bulk-loads the global (non-tenant-scoped) Puzzle table from Lichess's CC0
// puzzle export. Triggered manually via `npm run import:puzzles`, not per-tenant.
export const puzzleImportQueue = new Queue("puzzle-import", { connection });
