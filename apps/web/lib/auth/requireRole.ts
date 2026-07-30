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
