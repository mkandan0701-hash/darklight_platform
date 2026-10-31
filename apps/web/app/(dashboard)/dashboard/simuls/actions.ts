"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "../../../../lib/auth/session";
import { requireRole } from "../../../../lib/auth/requireRole";
import { TenantMismatchError } from "../../../../lib/auth/errors";
import { zonedLocalToUtc } from "../../../../lib/time";
import { createSimulWithBoards } from "../../../../repositories/simulRepository";
import { getCoachProfileByUserId } from "../../../../repositories/userRepository";

type ActionResult = { ok: true } | { ok: false; error: string };

const CreateSimulSchema = z.object({
  startsLocal: z.string().min(1, "Pick a start time"),
  // One board per student, capped: a simul is one coach against a room, and
  // past a couple of dozen boards nobody can actually keep up.
  studentIds: z.array(z.string().min(1)).min(1, "Pick at least one student").max(30),
});

export async function createSimulAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentSession();
  try {
    // Coaches only: the exhibitor plays every board, so an admin creating one
    // for themselves would have no seat at it.
    requireRole(session, ["COACH"]);
  } catch {
    return { ok: false, error: "Only a coach can give a simul" };
  }

  const parsed = CreateSimulSchema.safeParse({
    startsLocal: formData.get("startsLocal"),
    studentIds: formData.getAll("studentIds"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const coachProfile = await getCoachProfileByUserId(session.tenantId, session.id);
  if (!coachProfile) {
    return { ok: false, error: "No coach profile found for your account" };
  }

  let startsAtUtc: Date;
  try {
    startsAtUtc = zonedLocalToUtc(parsed.data.startsLocal, session.timezone);
  } catch {
    return { ok: false, error: "Invalid start time" };
  }

  try {
    await createSimulWithBoards({
      tenantId: session.tenantId,
      coachId: coachProfile.id,
      startsAtUtc,
      // De-duplicated: the same student twice would mean two boards one
      // person has to play at once.
      studentIds: [...new Set(parsed.data.studentIds)],
    });
  } catch (err) {
    if (err instanceof TenantMismatchError) {
      return { ok: false, error: "Those students aren't part of your academy" };
    }
    throw err;
  }

  revalidatePath("/dashboard/simuls");
  return { ok: true };
}
