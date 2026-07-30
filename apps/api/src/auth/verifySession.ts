import jwt from "jsonwebtoken";
import type { AuthedSession } from "@chessplay-clone/shared";

// Supabase Auth issues HS256 JWTs signed with the project's JWT secret.
// This decodes+verifies the token and maps Supabase's claims onto our own
// `AuthedSession` shape. `tenantId`/`role` are expected as custom claims set
// via a Supabase Auth hook at signup (mirroring our `User` row) — until that
// hook exists, callers should treat a missing claim as "deny", not "default".
export function verifySupabaseJwt(token: string): AuthedSession {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error("SUPABASE_JWT_SECRET is not set");
  }

  const payload = jwt.verify(token, secret) as Record<string, unknown>;
  const userId = payload.sub;
  const tenantId = payload["tenant_id"];
  const role = payload["role"];

  if (
    typeof userId !== "string" ||
    typeof tenantId !== "string" ||
    typeof role !== "string"
  ) {
    throw new Error("JWT is missing required tenant_id/role claims");
  }

  return { userId, tenantId, role: role as AuthedSession["role"] };
}
