// Nightly game sync from Lichess and Chess.com.
//
// Two job shapes share each queue, dispatched on job name:
//   "sweep"   — the repeatable nightly job. Fans out one "student" job per
//               student with a handle, so one student's failure (a renamed
//               account, a provider 500) retries alone instead of taking the
//               whole sweep down with it.
//   "student" — syncs exactly one student.

import { Worker, type Job } from "bullmq";
import { runWithTenant, type GameSource } from "@chessplay-clone/db";
import { chesscomSyncQueue, connection, lichessSyncQueue } from "../queues";
import { fetchLichessGames } from "../games/lichessGameSync";
import { fetchChesscomGames } from "../games/chesscomGameSync";
import { latestPlayedAt, listSyncTargets, persistSyncedGames } from "../games/gameSync";

export interface StudentSyncJobData {
  tenantId: string;
  studentId: string;
  handle: string;
}

async function fanOut(source: GameSource) {
  const targets = await listSyncTargets(source);
  const queue = source === "LICHESS" ? lichessSyncQueue : chesscomSyncQueue;

  for (const target of targets) {
    await queue.add("student", target, {
      // One in-flight job per student per source: a sweep landing while the
      // previous night's job is still retrying must not stack up a second
      // copy hitting the same provider for the same handle.
      jobId: `${source}:${target.studentId}`,
      removeOnComplete: true,
    });
  }

  return { studentsQueued: targets.length };
}

async function syncStudent(source: GameSource, data: StudentSyncJobData) {
  return runWithTenant(data.tenantId, async () => {
    const since = await latestPlayedAt(data.tenantId, data.studentId, source);

    const games =
      source === "LICHESS"
        ? await fetchLichessGames(data.handle, { since })
        : await fetchChesscomGames(data.handle);

    const { imported } = await persistSyncedGames(
      data.tenantId,
      data.studentId,
      source,
      games
    );
    return { fetched: games.length, imported };
  });
}

function createWorker(source: GameSource, queueName: string) {
  return new Worker(
    queueName,
    async (job: Job) =>
      job.name === "sweep" ? fanOut(source) : syncStudent(source, job.data as StudentSyncJobData),
    {
      connection,
      // Serial, and rate-limited well inside Chess.com's 300-per-5-minutes
      // per-IP budget (CLAUDE.md §10). Lichess asks only for fair use, and
      // gets the same treatment rather than a second policy to keep right.
      concurrency: 1,
      limiter: { max: 30, duration: 60_000 },
    }
  );
}

export function createLichessSyncWorker() {
  return createWorker("LICHESS", "lichess-sync");
}

export function createChesscomSyncWorker() {
  return createWorker("CHESSCOM", "chesscom-sync");
}
