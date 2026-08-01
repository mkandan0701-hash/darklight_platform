// Smoke test for the invite -> callback -> set-password -> dashboard chain.
// This path can't be covered by Vitest: it needs a real Supabase-issued token
// and a running Next.js server to exercise cookie writes and redirects. It is
// also the one flow that, if it regresses, locks every invited coach, student
// and parent out of the product permanently.
//
// Uses admin.generateLink() rather than admin.inviteUserByEmail() so it yields
// the same token shape without sending anyone an email.
//
// Start the dev server first, then run from apps/web:
//   npx tsx --env-file=.env.local scripts/verifyInviteFlow.ts [subdomain]

import { request } from "node:http";
import { prisma, prismaBase, enterTenantContext } from "@chessplay-clone/db";
import { createSupabaseAdminClient } from "../lib/supabase/admin";
import { createUserWithProfile } from "../repositories/userRepository";

const SUBDOMAIN = process.argv[2] ?? "demo-academy";
// Next reads PORT natively; WEB_PORT is kept for existing .env.local files.
const PORT = Number(process.env.PORT ?? process.env.WEB_PORT ?? 3000);
const TEST_EMAIL = "invite-smoke-test@demo-academy.test";
const HOST = `${SUBDOMAIN}.localhost:${PORT}`;

type Response = { status: number; location: string | null; cookies: string[]; body: string };

// *.localhost does not resolve through the OS resolver on Windows, so connect
// to the loopback address and carry the tenant in the Host header instead —
// which is exactly what middleware.ts reads.
function get(path: string, cookies: string[] = []): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port: PORT,
        path,
        method: "GET",
        headers: {
          host: HOST,
          ...(cookies.length ? { cookie: cookies.join("; ") } : {}),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            location: res.headers.location ?? null,
            cookies: (res.headers["set-cookie"] ?? []).map((c) => c.split(";")[0]),
            body,
          })
        );
      }
    );
    req.on("error", reject);
    req.end();
  });
}

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : ` -- ${detail}`}`);
}

async function deleteTestUser() {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data: list } = await supabaseAdmin.auth.admin.listUsers();
  const existing = list.users.find((u) => u.email === TEST_EMAIL);
  if (existing) await supabaseAdmin.auth.admin.deleteUser(existing.id);

  // Profiles hold the FK onto User, so they have to go first. Hard delete
  // rather than the app's usual soft delete — this is throwaway test data,
  // and a lingering row would collide with the next run's invite.
  const users = await prismaBase.user.findMany({
    where: { email: TEST_EMAIL },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (!userIds.length) return;

  await prismaBase.coachProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prismaBase.studentProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prismaBase.parentProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prismaBase.user.deleteMany({ where: { id: { in: userIds } } });
}

async function main() {
  const tenant = await prismaBase.tenant.findUnique({ where: { subdomain: SUBDOMAIN } });
  if (!tenant) throw new Error(`No tenant with subdomain "${SUBDOMAIN}"`);
  enterTenantContext(tenant.id);

  const reachable = await get("/login").then(
    (r) => r.status > 0,
    () => false
  );
  if (!reachable) {
    throw new Error(`No server on ${PORT}. Start it with: npm run dev:web`);
  }

  await deleteTestUser();

  // 1. Mint a real invite token, exactly as inviteMember() would.
  const supabaseAdmin = createSupabaseAdminClient();
  const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "invite",
    email: TEST_EMAIL,
    options: {
      redirectTo: `http://${HOST}/auth/callback`,
      data: { must_set_password: true },
    },
  });
  if (linkError || !link.properties?.hashed_token) {
    throw new Error(`generateLink failed: ${linkError?.message}`);
  }
  const tokenHash = link.properties.hashed_token;

  await createUserWithProfile({
    tenantId: tenant.id,
    email: TEST_EMAIL,
    role: "COACH",
    timezone: "Asia/Kolkata",
    authProviderId: link.user.id,
  });

  // 2. The callback should verify the token, set a session cookie, and send
  //    the invitee on to /set-password.
  const callback = await get(`/auth/callback?token_hash=${tokenHash}&type=invite`);
  check(
    "callback redirects an invite token to /set-password",
    callback.status === 307 && (callback.location ?? "").endsWith("/set-password"),
    `status=${callback.status} location=${callback.location}`
  );
  const sessionCookies = callback.cookies.filter((c) => c.startsWith("sb-"));
  check(
    "callback writes a Supabase session cookie",
    sessionCookies.length > 0,
    `set-cookie=${JSON.stringify(callback.cookies)}`
  );

  // 3. That session must actually be readable by the page it lands on.
  const setPassword = await get("/set-password", sessionCookies);
  check(
    "set-password renders for the invited user",
    setPassword.status === 200 && setPassword.body.includes(TEST_EMAIL),
    `status=${setPassword.status} hasEmail=${setPassword.body.includes(TEST_EMAIL)}`
  );

  // 4. Until a password exists the dashboard must bounce them back, or they
  //    can browse now and be locked out when the session expires.
  const gated = await get("/dashboard", sessionCookies);
  check(
    "dashboard bounces an invitee who has not set a password",
    gated.status === 307 && (gated.location ?? "").endsWith("/set-password"),
    `status=${gated.status} location=${gated.location}`
  );

  // 5. ...and must let them through once it does. Flipping the flag directly
  //    stands in for setPassword(), which clears it alongside the password.
  await supabaseAdmin.auth.admin.updateUserById(link.user.id, {
    user_metadata: { must_set_password: false },
  });
  const dashboard = await get("/dashboard", sessionCookies);
  check(
    "dashboard resolves the tenant from the invite host once the password is set",
    dashboard.status === 200,
    `status=${dashboard.status} location=${dashboard.location}`
  );

  // 6. A junk token must not fall through to a session.
  const badToken = await get("/auth/callback?token_hash=not-a-real-token&type=invite");
  check(
    "callback rejects an invalid token",
    badToken.status === 307 && (badToken.location ?? "").includes("/login?error=invalid_link"),
    `status=${badToken.status} location=${badToken.location}`
  );
  check(
    "callback writes no session cookie for an invalid token",
    badToken.cookies.filter((c) => c.startsWith("sb-") && !c.endsWith("=")).length === 0,
    `set-cookie=${JSON.stringify(badToken.cookies)}`
  );

  // 7. An already-consumed token must not be replayable.
  const replay = await get(`/auth/callback?token_hash=${tokenHash}&type=invite`);
  check(
    "callback rejects a replayed token",
    replay.status === 307 && (replay.location ?? "").includes("/login?error=invalid_link"),
    `status=${replay.status} location=${replay.location}`
  );

  await deleteTestUser();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(`\nERROR: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
