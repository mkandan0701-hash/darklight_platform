import { notFound } from "next/navigation";
import type { Role } from "@chessplay-clone/shared";
import type { CurrentSession } from "./session";
import { ForbiddenRoleError } from "./errors";

export function requireRole(session: CurrentSession, allowed: Role[]) {
  if (!allowed.includes(session.role)) {
    throw new ForbiddenRoleError(
      `Role ${session.role} is not permitted to perform this action`
    );
  }
}

/**
 * requireRole for pages: the wrong role gets the not-found page.
 *
 * A bare requireRole in a server component throws ForbiddenRoleError past the
 * route boundary, which Next renders as a 500 — the page was still refused,
 * but as a crash. claude.md §7 says typed errors are translated at the route
 * layer; for a page that means 404, which also confirms nothing about what
 * lives at the URL.
 */
export function requireRoleOrNotFound(session: CurrentSession, allowed: Role[]) {
  try {
    requireRole(session, allowed);
  } catch (err) {
    if (err instanceof ForbiddenRoleError) notFound();
    throw err;
  }
}
