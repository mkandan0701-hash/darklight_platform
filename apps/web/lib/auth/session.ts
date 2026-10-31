import { cache } from "react";
import { prismaBase, openTenantContext } from "@chessplay-clone/db";
import type { Role } from "@chessplay-clone/shared";
import { createSupabaseServerClient } from "../supabase/server";
import { UnauthorizedError } from "./errors";

export type CurrentSession = {
  id: string;
  authProviderId: string;
  tenantId: string;
  role: Role;
  email: string;
  // Nullable by design — render it through displayName(), never directly.
  displayName: string | null;
  timezone: string;
  // Invited users hold a valid session before they have a password of their
  // own. The dashboard layout uses this to send them to /set-password —
  // without it they can browse the app, then be locked out for good once the
  // session expires, with no password and no self-serve reset.
  mustSetPassword: boolean;
};

/**
 * The signed-in user, with their tenant bound as the ambient tenant context
 * for the caller's remaining work (see packages/db/src/context.ts).
 *
 * Deliberately not async. The context has to be opened synchronously in the
 * caller's frame, before the caller's own `await`, or the caller never sees
 * it. That is also why the binding happens here, on every call, and not
 * inside the memoized lookup below: a cache hit runs none of that function's
 * body.
 */
export function getCurrentSession(): Promise<CurrentSession> {
  const bindTenant = openTenantContext();
  return resolveSession().then((session) => {
    bindTenant(session.tenantId);
    return session;
  });
}

// Memoized per-request: safe to call from a layout and every page/action
// beneath it without duplicating the Supabase + Postgres round trip.
const resolveSession = cache(async (): Promise<CurrentSession> => {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new UnauthorizedError("Not signed in");
  }

  // Sanctioned use of the unextended client — see packages/db/src/index.ts.
  // We don't know tenantId yet; that's exactly what this lookup resolves.
  const dbUser = await prismaBase.user.findUnique({
    where: { authProviderId: user.id },
  });
  if (!dbUser || dbUser.deletedAt) {
    throw new UnauthorizedError("No matching account for this session");
  }

  return {
    id: dbUser.id,
    authProviderId: dbUser.authProviderId,
    tenantId: dbUser.tenantId,
    role: dbUser.role as Role,
    email: dbUser.email,
    displayName: dbUser.displayName,
    timezone: dbUser.timezone,
    // Set on invite, cleared by setPassword(). getUser() re-reads this from
    // the Auth server on every request, so it can't go stale. Absent for
    // accounts created through signup (they chose a password up front) and
    // for anyone invited before this flag existed.
    mustSetPassword: user.user_metadata?.must_set_password === true,
  };
});
