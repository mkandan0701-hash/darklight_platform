# chessplay-clone

A chess academy management SaaS platform for diaspora chess academies (India-based coaches teaching NRI students, and US/UK-based Indian coaches). See [`claude.md`](claude.md) for full product/architecture context, [`chessplay-clone-spec.md`](chessplay-clone-spec.md) for the technical spec, and [`chessplay-clone-gtm-v2.md`](chessplay-clone-gtm-v2.md) for go-to-market.

## Layout

npm workspaces monorepo:

| Path | What |
|---|---|
| `apps/web` | Next.js 14 (App Router) frontend — tenant dashboard, auth, classrooms |
| `apps/api` | Express + Socket.io backend — live session rooms, webhooks, queues |
| `packages/db` | Prisma schema, generated client, tenant-scoping extension |
| `packages/shared` | Zod schemas, roles, subdomain-resolution logic shared by both apps |

## Prerequisites

- Node.js 20+
- A Supabase project (Postgres + Auth) — used for both the database and auth
- Redis (local, or a Railway instance) for BullMQ queues in `apps/api`

## Setup

1. Install dependencies from the repo root:

   ```
   npm install
   ```

2. Copy `.env.example` to an `.env`/`.env.local` in each workspace that needs it, and fill in real values:

   ```
   cp .env.example packages/db/.env      # DATABASE_URL, DIRECT_URL
   cp .env.example apps/api/.env         # DATABASE_URL, SUPABASE_JWT_SECRET, REDIS_URL, webhook secrets, etc.
   cp .env.example apps/web/.env.local   # NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, etc.
   ```

   Not every var is needed in every workspace — see the comments in `.env.example` for what each one is for. At minimum, local dev needs `DATABASE_URL`/`DIRECT_URL` (in `packages/db`), the Supabase URL/anon key/JWT secret (in `apps/web` and `apps/api`), and `REDIS_URL` (in `apps/api`).

3. Generate the Prisma client and apply migrations:

   ```
   npm run db:generate
   npm run db:migrate
   ```

## Running locally

```
npm run dev:web   # Next.js dev server, http://localhost:3000 (WEB_PORT)
npm run dev:api   # Express + Socket.io server, http://localhost:4000 (API_PORT)
```

Tenant subdomains resolve automatically under `*.localhost` in dev (e.g. `academy1.localhost:3000`) — no extra hosts-file setup needed.

## Supabase Auth console setup

Three settings in the Supabase dashboard have no code equivalent. Invites will
*send* without the first two and then fail when the recipient clicks the link,
so do those before testing the invite flow. The third breaks live sessions
rather than invites — see below.

**1. Allow tenant subdomains as redirect targets.**
Authentication → URL Configuration → Redirect URLs. Every invite points at the
inviting academy's own host (`https://{subdomain}.{ROOT_DOMAIN}/auth/callback`),
so the allow-list needs wildcards:

```
https://*.chessplayclone.com/auth/callback
http://*.localhost:3000/auth/callback
```

Supabase's matcher treats `*` as a single path/host segment, so
`*.chessplayclone.com` covers `academy1.` but not `a.b.` — which is what we
want, since `resolveSubdomain` rejects multi-label prefixes anyway.

**2. Point the invite email at the token-hash callback.**
Authentication → Email Templates → *Invite user*. Supabase's default
`{{ .ConfirmationURL }}` returns the session in the URL **fragment**, which a
server can never read — the App Router callback would see an empty query
string. Replace the link with:

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite">Accept your invite</a>
```

`{{ .RedirectTo }}` is the per-tenant URL the invite was sent with, so one
template serves every academy. Do the same for the *Reset password* template
with `type=recovery`.

**3. Register the custom access token hook.**
Authentication → Hooks → *Custom Access Token* → enable and select
`custom_access_token_hook` (schema `public`). The migration
`20260730093333_custom_access_token_hook` creates the function; registering it
is manual, and Supabase stores that registration outside your database.

Without it, issued JWTs carry no `tenant_id`/`role` claims,
`verifySupabaseJwt()` correctly denies everything, and **every Socket.io
connection fails** — live sessions look broken for reasons unrelated to the
code. Verify it (no dev server or password needed):

```
cd apps/web
npm run verify:auth-hook           # or: npm run verify:auth-hook -- someone@academy.test
```

It checks the function exists, that only `supabase_auth_admin` may execute it
(it is `SECURITY DEFINER` and resolves any user's tenant, so a broader grant
would be an authorization bypass), then has Supabase issue a real token and
reads the claims back off it — the only honest proof of registration.

The invite flow then runs: admin invites from `/dashboard/members` →
`app/auth/callback/route.ts` verifies the token and sets the session cookie →
`/set-password` → `/dashboard`. The invite carries a `must_set_password` flag
in `user_metadata` that the dashboard layout enforces and `setPassword()`
clears, so an invitee can't skip the middle step and end up with a session but
no password. `app/auth/callback/route.ts` also accepts the
PKCE `?code=` shape, so browser-initiated flows (OAuth, client-requested magic
links) work through the same route without template changes.

**Verifying it.** The chain spans a real Supabase token, cookie writes and
redirects, so Vitest can't cover it. With the dev server running:

```
cd apps/web
npx tsx --env-file=.env.local scripts/verifyInviteFlow.ts [subdomain]   # default: demo-academy
```

It mints a genuine invite token with `admin.generateLink` (so **no email is
sent**), walks callback → set-password → dashboard, checks that invalid and
replayed tokens are refused, and deletes the test user afterwards. Step 1
above isn't needed for this script — it builds the callback URL itself rather
than going through Supabase's redirect allow-list — so a green run confirms
the code, not the console config.

### BullMQ worker + puzzle DB import

Background jobs run in a separate process from the API server so long-running work never blocks requests:

```
npm run worker --workspace=apps/api   # starts the BullMQ worker process (needs REDIS_URL)
```

With the worker running, one-off jobs can be enqueued via scripts. To bulk-load the global `Puzzle` table from Lichess's CC0 puzzle export (`lichess_db_puzzle.csv.zst`):

```
npm run import:puzzles --workspace=apps/api
# or with options (defaults: rating 400–2400, no count cap):
npm run import:puzzles --workspace=apps/api -- --ratingMin=600 --ratingMax=2000 --maxCount=50000
```

Safe to re-run — puzzles are upserted on Lichess's puzzle ID, so duplicates are skipped.

## Testing

```
npm run test
```

Runs Vitest across every workspace that has a `test` script. Every bug fix should ship with a test that would have caught it (see `claude.md` §8).

## Building

```
npm run build
```

Builds `packages/db` → `packages/shared` → `apps/web` → `apps/api`, in that order (workspaces depend on the two packages).
