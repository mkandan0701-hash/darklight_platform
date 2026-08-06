"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "../../../../lib/auth/session";
import { updateDisplayName } from "../../../../repositories/userRepository";

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
