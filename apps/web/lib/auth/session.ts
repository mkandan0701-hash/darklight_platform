import { cache } from "react";
import { prismaBase, enterTenantContext } from "@chessplay-clone/db";
import type { Role } from "@chessplay-clone/shared";
import { createSupabaseServerClient } from "../supabase/server";
import { UnauthorizedError } from "./errors";

export type CurrentSession = {
  id: string;
  authProviderId: string;
  tenantId: string;
  role: Role;
  email: string;
  timezone: string;
};

// Memoized per-request: safe to call from a layout and every page/action
// beneath it without duplicating the Supabase + Postgres round trip.
export const getCurrentSession = cache(async (): Promise<CurrentSession> => {
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

  // Binds tenantId to this request's ambient context for the rest of this
  // request's execution — see packages/db/src/context.ts for why
  // enterWith() is safe specifically at this call site.
  enterTenantContext(dbUser.tenantId);

  return {
    id: dbUser.id,
    authProviderId: dbUser.authProviderId,
    tenantId: dbUser.tenantId,
    role: dbUser.role as Role,
    email: dbUser.email,
    timezone: dbUser.timezone,
  };
});
