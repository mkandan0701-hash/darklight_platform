import { runWithTenant } from "@chessplay-clone/db";
import type { AuthedSession, Role } from "@chessplay-clone/shared";
import { verifySupabaseJwt } from "../auth/verifySession";
import { findAppUserByAuthId } from "../repositories/liveSessionRepository";

export type SocketSessionData = {
  session: AuthedSession;
  /** The application `User` row. `id` here is a User.id, not the auth id. */
  appUser: { id: string; email: string };
  displayName: string;
  /** Resolved lazily by the reference-board handlers; a CoachProfile.id. */
  coachProfileId?: string | null;
};

// Everyone in a chess classroom sees everyone else's chat messages. Showing
// the full address would hand every student the coach's and their classmates'
// email addresses, so only the local part is broadcast.
export function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local.length > 0 ? local : email;
}

/**
 * What this person is called in chat and the audio roster.
 *
 * Prefers the name they set on their profile, falling back to the email local
 * part — the same order apps/web/lib/displayName.ts uses, so a coach who
 * renames themselves isn't "asha.rao" in the lesson and "Asha Rao" everywhere
 * else. Still never the full address: the fallback exists to keep classmates'
 * emails off each other's screens, and a set name must not reintroduce one.
 */
export function resolveDisplayName(user: {
  displayName?: string | null;
  email: string;
}): string {
  const set = user.displayName?.trim();
  if (set) return set;
  return displayNameFromEmail(user.email);
}

// Runs once per socket connection, before any handler is registered. Resolving
// the User row here (rather than lazily per event) means a deleted account or a
// token whose tenant claim doesn't match the row is refused at connect time.
export async function authenticateSocket(
  token: unknown
): Promise<SocketSessionData> {
  if (typeof token !== "string") {
    throw new Error("Missing auth token");
  }
  const claims = verifySupabaseJwt(token);

  const appUser = await runWithTenant(claims.tenantId, () =>
    findAppUserByAuthId(claims.tenantId, claims.userId)
  );
  if (!appUser) {
    throw new Error("No matching account for this session");
  }

  return {
    // The DB row wins over the token's `role` claim. A coach demoted to student
    // must lose the reference board immediately, not whenever their JWT
    // happens to expire.
    session: { ...claims, role: appUser.role as Role },
    appUser: { id: appUser.id, email: appUser.email },
    displayName: resolveDisplayName(appUser),
  };
}
