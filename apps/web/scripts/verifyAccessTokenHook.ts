// Proves that the Supabase Custom Access Token hook is actually registered.
//
// The migration 20260730093333_custom_access_token_hook creates the SQL
// function, but registering it is a manual dashboard step that no migration
// can perform. If it's missed, issued JWTs carry no tenant_id/role claims,
// verifySupabaseJwt() correctly denies everything, and *every* Socket.io
// connection fails — live sessions look broken for reasons that have nothing
// to do with the code. Nothing else in the repo catches that.
//
// Registration state lives in Supabase's own config, not in our database, so
// the only honest check is to have Supabase issue a token and read the claims
// back off it. That's what step 3 does.
//
// No dev server and no password required — generateLink + verifyOtp yields a
// real session for an existing user without emailing anyone.
//
// Run from apps/web:
//   npx tsx --env-file=.env.local scripts/verifyAccessTokenHook.ts [email]

import { createClient } from "@supabase/supabase-js";
import { prismaBase } from "@chessplay-clone/db";
import { createSupabaseAdminClient } from "../lib/supabase/admin";

const FIX = `
  Fix: Supabase Dashboard -> Authentication -> Hooks -> Custom Access Token
       -> enable, and select "custom_access_token_hook" (schema: public).`;

function fail(message: string): never {
  console.error(`FAIL  ${message}`);
  process.exit(1);
}

function pass(message: string) {
  console.log(`ok    ${message}`);
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split(".");
  if (!payload) fail("Access token is not a JWT");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

async function main() {
  const emailArg = process.argv[2];

  // --- 1. The SQL function exists -------------------------------------
  const fn = await prismaBase.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'custom_access_token_hook'
     ) AS exists`
  );
  if (!fn[0]?.exists) {
    fail(
      "public.custom_access_token_hook does not exist. Run `npm run db:migrate` first."
    );
  }
  pass("public.custom_access_token_hook exists");

  // --- 2. It is not callable by ordinary users -------------------------
  // SECURITY DEFINER + it resolves any user's tenant_id/role by user id, so
  // a stray GRANT here would be an authorization bypass in its own right.
  const grants = await prismaBase.$queryRawUnsafe<
    Array<{ role: string; can_execute: boolean }>
  >(
    `SELECT r.rolname AS role,
            has_function_privilege(r.rolname, 'public.custom_access_token_hook(jsonb)', 'EXECUTE') AS can_execute
       FROM pg_roles r
      WHERE r.rolname IN ('authenticated', 'anon', 'supabase_auth_admin')`
  );
  for (const { role, can_execute } of grants) {
    if (role === "supabase_auth_admin" && !can_execute) {
      fail("supabase_auth_admin cannot EXECUTE the hook — Auth will not be able to call it");
    }
    if (role !== "supabase_auth_admin" && can_execute) {
      fail(`${role} can EXECUTE the hook — revoke it, this is an authorization bypass`);
    }
  }
  pass("EXECUTE is granted to supabase_auth_admin only");

  // --- 3. A freshly issued token actually carries the claims -----------
  const admin = createSupabaseAdminClient();
  const user = emailArg
    ? await prismaBase.user.findFirst({ where: { email: emailArg, deletedAt: null } })
    : await prismaBase.user.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
      });
  if (!user) {
    fail(
      emailArg
        ? `No active User row with email ${emailArg}`
        : "No users exist yet — sign up first, then re-run"
    );
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: user.email,
  });
  if (linkError || !link.properties?.hashed_token) {
    fail(`Could not generate a login link for ${user.email}: ${linkError?.message}`);
  }

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyError || !verified.session) {
    fail(`Could not exchange the link for a session: ${verifyError?.message}`);
  }

  const claims = decodeJwtPayload(verified.session.access_token);
  const tenantId = claims["tenant_id"];
  const role = claims["role"];

  if (typeof tenantId !== "string" || typeof role !== "string") {
    fail(
      `Token for ${user.email} carries no tenant_id/role claims — the hook is NOT registered.${FIX}`
    );
  }
  pass("issued JWT carries tenant_id and role claims");

  // --- 4. The claims match the authoritative row -----------------------
  if (tenantId !== user.tenantId) {
    fail(`tenant_id claim ${tenantId} does not match User.tenantId ${user.tenantId}`);
  }
  // Supabase also uses a "role" claim of its own ("authenticated") on tokens
  // it issues; the hook overwrites it. Seeing that value back means the hook
  // ran but didn't resolve this user.
  if (role === "authenticated") {
    fail(`role claim is still Supabase's default — the hook did not resolve ${user.email}.${FIX}`);
  }
  if (role !== user.role) {
    fail(`role claim ${role} does not match User.role ${user.role}`);
  }
  pass(`claims match the User row for ${user.email} (${role})`);

  console.log("\nAccess token hook is registered and working.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prismaBase.$disconnect());
