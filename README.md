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
npm run dev:web   # Next.js dev server, http://localhost:3000 (PORT)
npm run dev:api   # Express + Socket.io server, http://localhost:4000 (API_PORT)
```

`npm run dev:api` needs `REDIS_URL` to point at a running Redis. Live sessions
hold their authoritative board position there, so without it `join-room` hangs
and every session appears broken.

Tenant subdomains resolve automatically under `*.localhost` in dev (e.g. `academy1.localhost:3000`) — no extra hosts-file setup needed.

### Demo data and smoke tests

Several paths can't be reached by Vitest — async server components hitting real
Prisma rows, and Socket.io over a real connection. These scripts cover them:

```
npm run seed:demo         -w apps/web   # one account per role + classroom, session, homework
npm run verify:auth-hook  -w apps/web   # the Supabase hook above is actually registered
npm run verify:dashboards -w apps/web   # all four role dashboards render (dev server must be up)
npm run verify:live       -w apps/api   # realtime: moves, arrows, chat, ref board, audio signalling
```

`seed:demo` puts the coach in `Asia/Kolkata`, the student in `America/New_York`
and the parent in `Europe/London`, so anything rendering a time in the wrong
zone is visible immediately. All demo passwords are `DemoPass123!`.

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

## Deploying

### A wildcard domain is a hard requirement

Every academy lives on its own subdomain, so the deployment needs `*.yourdomain.com`
pointed at Vercel with a wildcard certificate. This is not cosmetic:
`resolveSubdomain` classifies **every** `*.vercel.app` host as apex
(`packages/shared/src/subdomain.ts`), deliberately — a preview deployment's
subdomain is the project name, not a tenant. On a bare `*.vercel.app` URL the
marketing site and `/signup` work, `/dashboard` redirects to `/signup` because no
`Tenant` resolves from the host, and invites are refused outright with *"Invites
need a tenant subdomain"*.

DNS records:

| Record | Name | Value |
|---|---|---|
| A / CNAME | `@` | as issued by Vercel |
| CNAME | `*` | `cname.vercel-dns.com` |

Add both the apex and `*.yourdomain.com` as domains on the Vercel project; the
wildcard certificate is issued by DNS validation.

### Frontend → Vercel

`vercel.json` at the repo root drives the build, so leave the project's **Root
Directory at the repository root** — not `apps/web`. The build runs
`scripts/vercelBuild.mjs`, which does `prisma generate` → migrations (production
only) → `packages/db` → `packages/shared` → `apps/web`. `prisma generate` has to
come first because `packages/db` re-exports the generated client, and Vercel's
dependency cache can otherwise restore a client older than the schema.

**Migrations run only when `VERCEL_ENV=production`.** Preview deploys share
`DATABASE_URL` unless you give them their own, so an ungated `migrate deploy`
would let a build from an abandoned branch migrate production.

Environment variables to set on the Vercel project:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Supabase pooled connection (`?pgbouncer=true`) |
| `DIRECT_URL` | Direct connection — migrations cannot run through the pooler |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL` | Same value |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY` | Same value |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only; never exposed to the browser |
| `SUPABASE_JWT_SECRET` | Verifies the tenant/role claims |
| `NEXT_PUBLIC_ROOT_DOMAIN` | e.g. `yourdomain.com` — no scheme, no subdomain |
| `NEXT_PUBLIC_API_URL` | The Railway API's URL; only live sessions need it |

Stripe, Razorpay, WhatsApp, Resend and `ANTHROPIC_API_KEY` can be left unset —
nothing in the codebase calls them yet, so their absence cannot break a build.

### Supabase console, again

The three manual steps under "Supabase Auth console setup" above are per-project
**and** per-domain. Redo them against the production domain — in particular the
redirect allow-list needs `https://*.yourdomain.com/auth/callback`, and without
the custom access token hook every issued JWT lacks `tenant_id`/`role`, which
takes down every Socket.io connection.

### API → Railway (only needed for live sessions)

`apps/api` builds with `npm run build -w apps/api` and starts with `npm start -w
apps/api`. It needs `REDIS_URL`, `DATABASE_URL`, `DIRECT_URL` and
`SUPABASE_JWT_SECRET`. Without Redis the board store and the Socket.io adapter
both fail and `join-room` hangs — every live session looks broken. Everything
else in the product (auth, classrooms, homework, puzzles, play vs computer,
analysis board) works without the API running at all.
