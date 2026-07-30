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
