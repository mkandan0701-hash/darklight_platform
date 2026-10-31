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
import { studentSyncJobSchema, type StudentSyncJobData } from "@chessplay-clone/shared";
import { chesscomSyncQueue, connection, lichessSyncQueue } from "../queues";
import { parseJob } from "../queues/payloads";
import { fetchLichessGames } from "../games/lichessGameSync";
import { fetchChesscomGames } from "../games/chesscomGameSync";
import { findSyncHandle, latestPlayedAt, listSyncTargets, persistSyncedGames } from "../games/gameSync";

async function fanOut(source: GameSource) {
  const targets = await listSyncTargets(source);
  const queue = source === "LICHESS" ? lichessSyncQueue : chesscomSyncQueue;

  for (const target of targets) {
    const job: StudentSyncJobData = { tenantId: target.tenantId, studentId: target.studentId };
    await queue.add("student", job, {
      // One in-flight job per student per source: a sweep landing while the
      // previous night's job is still retrying must not stack up a second
      // copy hitting the same provider for the same handle.
      jobId: `${source}:${target.studentId}`,
      removeOnComplete: true,
    });
  }

  return { studentsQueued: targets.length };
}

export async function syncStudent(source: GameSource, data: StudentSyncJobData) {
  return runWithTenant(data.tenantId, async () => {
    // Read now, from the student's own row in the job's tenant: the job may be
    // a day old (the handle changed or was cleared), and a student id that
    // isn't in this tenant finds nothing rather than writing games across.
    const handle = await findSyncHandle(data.tenantId, data.studentId, source);
    if (!handle) return { skipped: "no handle for this student in this tenant" };

    const since = await latestPlayedAt(data.tenantId, data.studentId, source);

    const games =
      source === "LICHESS"
        ? await fetchLichessGames(handle, { since })
        : await fetchChesscomGames(handle);

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
      job.name === "sweep"
        ? fanOut(source)
        : syncStudent(source, parseJob(studentSyncJobSchema, job.data, queueName)),
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
