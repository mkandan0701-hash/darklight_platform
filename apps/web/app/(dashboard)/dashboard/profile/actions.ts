"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "../../../../lib/auth/session";
import {
  updateDisplayName,
  updateStudentChessAccounts,
} from "../../../../repositories/userRepository";

type ActionResult = { ok: true } | { ok: false; error: string };

const ProfileSchema = z.object({
  // Empty is allowed and means "clear it" — the repository normalizes it to
  // null and displayName() falls back to the email local part.
  displayName: z.string().max(80, "Name is too long"),
});

/**
 * Deliberately no requireRole: every role renames themselves, and nobody
 * renames anybody else. The identity comes from the session, never the form,
 * so there is no id here for a caller to substitute.
 */
export async function updateProfileAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentSession();

  const parsed = ProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await updateDisplayName(session.tenantId, session.id, parsed.data.displayName);

  // The name shows up in the nav greeting and on every page that lists this
  // person, so the whole dashboard subtree is stale after this.
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

// Loose on purpose: these are identifiers issued by five different bodies
// whose formats this app does not control, so the only rules enforced are
// the ones that would otherwise break something downstream — no whitespace
// inside a handle (the sync URL would 404 every night) and a sane length.
const HandleSchema = z
  .string()
  .max(60, "That handle is too long")
  .regex(/^[A-Za-z0-9_\-.]*$/, "Use letters, numbers, hyphens or underscores only");

const FederationIdSchema = z
  .string()
  .max(30, "That ID is too long")
  .regex(/^[A-Za-z0-9\-]*$/, "Use letters, numbers or hyphens only");

const ChessAccountsSchema = z.object({
  lichessHandle: HandleSchema,
  chesscomHandle: HandleSchema,
  fideId: FederationIdSchema,
  uscfId: FederationIdSchema,
  eclId: FederationIdSchema,
});

/**
 * A student's own external accounts. Same identity rule as
 * updateProfileAction: the StudentProfile is found from the session's userId,
 * never from the form, so there is no id to substitute.
 *
 * These are what the nightly Lichess/Chess.com sync looks up students by, and
 * what a RATING_MILESTONE certificate prints as the federation ID.
 */
export async function updateChessAccountsAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentSession();
  if (session.role !== "STUDENT") {
    return { ok: false, error: "Only students have chess accounts to link" };
  }

  const parsed = ChessAccountsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const updated = await updateStudentChessAccounts(session.tenantId, session.id, parsed.data);
  if (updated.count === 0) {
    return { ok: false, error: "No student profile found for your account" };
  }

  revalidatePath("/dashboard/profile");
  return { ok: true };
}
