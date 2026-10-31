// Queued per-game Stockfish analysis.
//
// Queued rather than inline (CLAUDE.md §3.7) because this is the expensive
// case the rule exists for: one job evaluates every position in a game, which
// is seconds to minutes of CPU — nothing a request thread should ever wait on.

import { Worker, type Job } from "bullmq";
import { runWithTenant } from "@chessplay-clone/db";
import { connection } from "../queues";
import { analyzeGame, resolveStudentColor, DEFAULT_DEPTH } from "../analysis/analyzeGame";
import { StockfishEngine } from "../analysis/stockfishEngine";
import {
  completeAnalysis,
  failAnalysis,
  findGameForAnalysis,
  startAnalysis,
} from "../repositories/gameAnalysisRepository";

export interface GameAnalysisJobData {
  tenantId: string;
  gameId: string;
  depth?: number;
}

async function runAnalysis(data: GameAnalysisJobData) {
  const depth = data.depth ?? DEFAULT_DEPTH;

  const game = await runWithTenant(data.tenantId, () =>
    findGameForAnalysis(data.tenantId, data.gameId)
  );
  if (!game) {
    // Not an error worth retrying: the game was deleted, or the job carries a
    // tenant that doesn't own it.
    return { skipped: "game not found" };
  }

  const analysisId = await runWithTenant(data.tenantId, () =>
    startAnalysis(data.tenantId, data.gameId, depth)
  );

  const engine = new StockfishEngine();
  try {
    await engine.ready();
    const result = await analyzeGame(game.pgn, engine, { depth });

    // Whose accuracy this is. Null when the PGN's names match neither handle
    // on file — better a missing figure than one attributed to the wrong side.
    const color = resolveStudentColor(game.pgn, [
      game.student.lichessHandle,
      game.student.chesscomHandle,
    ]);
    const accuracy =
      color === "w" ? result.accuracyWhite : color === "b" ? result.accuracyBlack : null;

    // Both sides' mistakes are stored, each tagged with its colour, so a coach
    // can walk the whole game rather than only the student's half of it.
    await runWithTenant(data.tenantId, () =>
      completeAnalysis(data.tenantId, analysisId, {
        accuracy,
        blunders: result.mistakes,
      })
    );

    return {
      analysisId,
      movesAnalyzed: result.movesAnalyzed,
      mistakes: result.mistakes.length,
      accuracy,
    };
  } catch (error) {
    await runWithTenant(data.tenantId, () => failAnalysis(data.tenantId, analysisId));
    throw error;
  } finally {
    await engine.quit();
  }
}

export function createGameAnalysisWorker() {
  return new Worker(
    "game-analysis",
    (job: Job<GameAnalysisJobData>) => runAnalysis(job.data),
    {
      connection,
      // One engine process at a time: Stockfish will happily eat every core
      // on the box, and this worker shares it with the sync jobs.
      concurrency: 1,
    }
  );
}
