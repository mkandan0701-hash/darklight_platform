"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "../../../../lib/auth/session";
import { requireRole } from "../../../../lib/auth/requireRole";
import { getGame } from "../../../../repositories/gameRepository";
import { enqueueGameAnalysis } from "../../../../lib/queues/analysisQueue";

type ActionResult = { ok: true } | { ok: false; error: string };

const RequestAnalysisSchema = z.object({ gameId: z.string().min(1) });

/**
 * Queues a game for server-side Stockfish analysis.
 *
 * Staff-only: analysis is minutes of CPU per game (claude.md §3.7), so the
 * people who can spend it are the ones responsible for the academy's
 * resources, not every student clicking through their own history.
 */
export async function requestGameAnalysisAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
  } catch {
    return { ok: false, error: "Only admins or coaches can request analysis" };
  }

  const parsed = RequestAnalysisSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // The gameId comes off a form: confirm it is this academy's game before
  // spending engine time on it, and so a guessed id reveals nothing.
  const game = await getGame(session.tenantId, parsed.data.gameId);
  if (!game) {
    return { ok: false, error: "Game not found" };
  }

  try {
    await enqueueGameAnalysis({ tenantId: session.tenantId, gameId: game.id });
  } catch {
    // Redis being down is an operational problem, not the coach's mistake —
    // say so plainly rather than leaving the button looking broken.
    return { ok: false, error: "Analysis queue is unavailable — please try again later" };
  }

  revalidatePath("/dashboard/games");
  return { ok: true };
}
