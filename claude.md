# CLAUDE.md

Instructions for Claude Code when working on this repository. Read this at the start of every session before making changes.

---

## 1. What This Project Is

A chess academy management SaaS platform — feature parity with [ChessPlay.io](https://chessplay.io), positioned specifically for **diaspora chess academies** (India-based coaches teaching NRI students in US/UK, and US/UK-based Indian coaches).

**This is a standalone product**, entirely separate from any other chess project (ChessGrowth, Darklight, ThinkOS, chess-growth repo). Do not import from, reference, or reuse code from those repos. Do not add references to them in this codebase.

**Business context that shapes technical decisions:**
- Target customer: chess coaches with 10–300 diaspora students, paying USD.
- Multi-tenant SaaS from day one — every academy is a `Tenant`, all data is tenant-scoped.
- Pricing: $19 / $49 / $99 per month tiers. Build for the $49 Growth tier customer (small academy, 50 students, one coach).
- Wedge features (time zones, multi-currency, WhatsApp, parent portal, college-app certificates) must feel first-class, not afterthoughts.

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Board rendering | `react-chessboard` + `chess.js` |
| Engine (client) | Stockfish WASM (play vs computer, analysis board) |
| Engine (server) | Stockfish binary (queued analysis jobs) |
| Realtime | Socket.io |
| Audio/Video | Native `RTCPeerConnection` (WebRTC) audio first; Agora video later |
| Backend | Node.js + Express, TypeScript |
| Database | PostgreSQL via Prisma |
| Cache/Queue | Redis + BullMQ |
| Auth | Supabase Auth (decided during Wave 1 implementation) |
| Payments | Stripe India (USD) + Razorpay (INR backup) |
| Email | Resend |
| AI (reports) | Claude Haiku via Batch API |
| Hosting | Vercel (frontend) + Railway (API + Postgres + Redis) |

Do not swap out any of these without checking first. Every choice was deliberate.

**Audio — decided during Wave 2 implementation.** This row originally read
`simple-peer`. It was replaced with the browser's native `RTCPeerConnection`
because simple-peer needs `process`/`buffer`/`readable-stream` polyfills to run
under Next 14's webpack 5 — a custom webpack block in an otherwise clean
`next.config.js` — and is effectively unmaintained. Live-session audio has no
data channels, so the abstraction was worth roughly forty lines of offer/answer
handling. The implementation is in `apps/web/lib/audio/`.

**Audio is STUN-only today.** There is no TURN relay, so connections behind
symmetric NAT or a restrictive corporate firewall will fail — realistically
10–20%, and this product's traffic is India↔US home and office networks. Adding
TURN (coturn on Railway, or Cloudflare Calls) is a known cost decision, not an
oversight. See `apps/web/lib/audio/iceServers.ts`.

---

## 3. Architectural Principles

Read these before designing any new module.

1. **Multi-tenant, always.** Every model except `Tenant` and global reference data (like `Puzzle`) must have a `tenantId` foreign key. Every query must filter by tenant via a middleware layer. Never write a query without tenant scoping.

2. **Role-based access at the API layer, not just the UI.** Roles are `ACADEMY_ADMIN`, `COACH`, `STUDENT`, `PARENT`. Do server-side authorization on every endpoint. UI hiding a button is not security.

3. **Realtime moves are server-validated.** Every `move` event over Socket.io is re-validated with `chess.js` on the server before broadcasting. Never trust client move data.

4. **Coach-only data stays server-side.** The coach's reference board is in a separate Socket.io room (`session:{roomId}:coach`) with role-gated joins. Never broadcast reference-board events to the shared room, even by accident.

5. **Time zones are first-class.** Store all timestamps in UTC. Every user has a `timezone` field. Every UI that shows a time must convert to the viewer's timezone, not the sender's. This is a wedge feature — get it right.

6. **Multi-currency from day one.** `Invoice.amount` is stored in the smallest unit of `Invoice.currency` (paise for INR, cents for USD). Never mix currencies without explicit conversion + storing the rate used.

7. **Async by default for expensive work.** Game analysis, report generation, external syncs (Lichess/Chess.com) go through BullMQ. Never block a request thread on Stockfish or an external API call.

8. **Idempotent external integrations.** Lichess/Chess.com sync jobs must be safely re-runnable. Use `externalId` unique constraints on `Game`, don't create duplicates.

---

## 4. Data Model Summary

Full Prisma schema is in the tech spec doc. Key models and their relationships:

- `Tenant` → owns `User`, `Classroom`, `Tournament`, `Invoice`
- `User` (roles: `ACADEMY_ADMIN` / `COACH` / `STUDENT` / `PARENT`) → has one of `CoachProfile` / `StudentProfile` / `ParentProfile`
- `Classroom` → many `CoachProfile` (via `ClassroomCoach`) + many `StudentProfile` (via `ClassroomStudent`) + many `LiveSession` + many `Assignment`
- `LiveSession` → optional `ReferenceBoard` (coach-only), many `AttendanceRecord`
- `Assignment` → many `Puzzle` (via `AssignmentPuzzle`)
- `PuzzleAttempt` → logs every attempt with `attemptMoves` (JSON array of every move tried), `timeTakenSecs`, `isCorrect`
- `Game` (imported or played) → optional `GameAnalysis`
- `Invoice` → belongs to `StudentProfile`, has Stripe or Razorpay identifiers
- `ParentStudent` → parents can be linked to multiple students, students can have multiple parents

**Never delete rows.** Add `deletedAt` timestamp columns for soft-delete on user-facing data. Coaches and parents need audit trails.

---

## 5. Socket.io Architecture

Rooms per live session:

| Room | Members | Purpose |
|---|---|---|
| `session:{roomId}` | Coach + student(s) | Shared board sync, chat, arrows |
| `session:{roomId}:coach` | Coach only | Reference board (coach's prep material) |
| `session:{roomId}:audio` | Opted-in members of the shared room | WebRTC signalling for voice |
| `simul:{simulId}:{boardIdx}` | Coach + one student | Simul (many parallel rooms per simul event) |
| `tournament:{tournamentId}` | Participants + spectators | Live pairings, results |

Enforce role checks on room joins server-side.

| Room | Events |
|---|---|
| Shared | `move`, `game-state`, `draw-arrow`, `clear-arrows`, `flip-board`, `chat-message` |
| Coach-only | `ref-board-load`, `ref-board-move`, `ref-board-clear`, `ref-board-state` |
| Audio | `audio-join`, `audio-leave`, `audio-signal`, `audio-peer-joined`, `audio-peer-left` |

Rules that hold across all of them:

- **Identity is stamped server-side.** Author fields on a broadcast come from
  the socket's verified session, never the payload — the Zod schemas in
  `apps/api/src/socket/schemas.ts` reject author fields outright.
- **Every payload is Zod-parsed** before it reaches game or DB logic. Socket
  handlers are this service's route boundary (§7).
- **Coach-only actions** are `clear-arrows` and `flip-board`, because both act
  on everyone's screen. A student flipping their own view emits nothing.
- **Audio is a sub-room of the shared room**, so it inherits `join-room`'s
  classroom-membership check — but joining the board never puts anyone on a
  live mic. `audio-signal` verifies the target peer is in the *same* call
  before relaying; without that, the target id is arbitrary and the handler
  becomes a way to push an SDP blob at any client on the server.
- **Board state lives in Redis**, not in process memory, and Socket.io runs
  behind `@socket.io/redis-adapter`. Both are needed together — see spec §3.4.

---

## 6. Build Order (Waves)

Do not build out of order. Each wave depends on the previous.

**Wave 1 — Foundation**
- Multi-tenant auth (Clerk or Supabase Auth), role model, subdomain routing.
- Academy admin dashboard, coach/student/parent onboarding.
- Classrooms model + enrollment.
- Basic tenant branding (logo, color).

**Wave 2 — Teaching core + wedge features**
- Puzzle DB import from Lichess (CC0 puzzle export).
- Homework/quizzes: assign, submit, attempt logging (log every move).
- Play vs Stockfish (WASM client-side).
- Analysis board.
- Live session with shared board + audio (native WebRTC — see §2).
- Coach-only reference board (separate socket room).
- **Time-zone-aware scheduling** (wedge — high priority).
- Weekend-first classroom templates (wedge).

**Wave 3 — Business ops + wedge features**
- Attendance tracking (online + offline modes).
- **Multi-currency invoicing** (Stripe USD + Razorpay INR). (wedge)
- **WhatsApp Business API integration** for parent updates. (wedge)
- **Parent portal** (rich progress/attendance/homework views). (wedge)
- Branded parent reports (Claude Haiku Batch + Resend).

**Wave 4 — Engagement + certificates**
- Lichess & Chess.com game sync (nightly cron + BullMQ).
- Game analysis (server Stockfish, queued).
- Tournaments (Swiss + Arena).
- Simul.
- Gamification (XP, badges, leaderboards).
- **College-app certificate generator** (wedge).
- **Multi-federation rating tracking** (FIDE + USCF + ECF). (wedge)

---

## 7. Coding Conventions

- **TypeScript strict mode always.** No `any` without a comment explaining why.
- **Zod schemas for all API inputs.** Validate at the route handler, not in the business logic.
- **Prisma queries in a `repositories/` layer.** Do not call `prisma.*` directly from route handlers or services.
- **Feature folders** on the frontend: `app/(dashboard)/classrooms/`, `app/(dashboard)/homework/`, etc. Not layer-based folders.
- **Server actions or tRPC** for internal API, REST only for webhooks and external integrations.
- **Environment variables** in `.env.local`, documented in `.env.example`. Never commit real values.
- **Error handling**: throw typed errors (`class TenantMismatchError extends Error`), catch at the route layer and translate to HTTP.

---

## 8. Testing

- **Unit tests** for chess logic, move validation, puzzle attempt scoring, invoice calculations, timezone conversions. Vitest.
- **Integration tests** for API routes with a test Postgres (via testcontainers or a dedicated schema).
- **Do not test framework code** (Next.js routing, Prisma internals).
- **Every bug fix ships with a test that would have caught the bug.**

Run `npm run test` before every commit.

---

## 9. What NOT to Build (Scope Discipline)

Do not add these without explicit direction, even if a user asks:

- Native mobile apps (planned for Phase 2, budgeted separately).
- Video-first live sessions (Wave 2 is audio-only; Agora video is post-Wave-4).
- Public chess.com-style ratings ladder outside classrooms.
- Social features (friends, followers, public profiles).
- Streaming / broadcast features.
- Puzzle rush / puzzle battles.
- Opening explorer / master database.
- Anything for non-diaspora Indian academies (that's phase 3 expansion, not now).

If a feature request doesn't obviously fit the wedge or a wave, flag it, don't build it.

---

## 10. External Integrations Quick Reference

| Integration | Auth | Rate limits | Docs |
|---|---|---|---|
| Lichess API | None (public endpoints) | Fair use | https://lichess.org/api |
| Chess.com API | None (public) | 300 req/5 min per IP | https://www.chess.com/news/view/published-data-api |
| Stripe | Secret key + webhook signing | High | Standard |
| Razorpay | Key ID + secret + webhook signing | High | Standard |
| Resend | API key | 100/sec | Standard |
| WhatsApp Business API | Meta business account + phone number | Rate-limited by tier | Complex — requires business verification |
| Claude API (Batch) | Anthropic API key | Standard | See product-self-knowledge skill |

Store API keys in Railway environment variables. Never in code, never in Git.

---

## 11. Common Pitfalls to Avoid

- **Forgetting tenant scoping in a Prisma query.** Always filter by `tenantId`. Add a Prisma middleware if you find yourself forgetting.
- **Trusting client-side board state.** Always re-validate moves server-side.
- **Storing timestamps in local time.** UTC always in the DB. Convert only in the UI layer.
- **Sending emails/WhatsApp from a request handler.** Always queue via BullMQ.
- **Hardcoding INR or USD.** All money uses the `currency` field. Never assume.
- **Copying Chesslang/ChessPlay UI 1:1.** Take inspiration, but the diaspora UX is different — different scheduling defaults, different report emphasis, different parent role.
- **Skipping the "log every attempt" behavior on puzzles.** This is a core differentiator vs generic chess trainers. Log every move a student tries, even the wrong ones.

---

## 12. Reference Docs

Alongside this file in the project root:
- `chessplay-clone-spec.md` — full technical spec (schema, API surface, realtime).
- `chessplay-clone-gtm-v2.md` — go-to-market plan (wedge, pricing, first 10 customers).

Read both before making product-shaping decisions. Update them (as a separate step, flagged to the user) when architecture or scope decisions change.

---

## 13. Git & Deployment

- Main branch: `main`. Deploy from here.
- Feature branches: `feat/`, `fix/`, `chore/` prefixes.
- Every PR needs: description of what changed, tests, and a note on migrations if the Prisma schema changed.
- **Prisma migrations**: `npx prisma migrate dev` in dev, `npx prisma migrate deploy` in production (Railway auto-runs on deploy).
- **Never** run destructive migrations (drop tables, drop columns) without a backup + explicit user confirmation.

Deployment targets:
- Frontend → Vercel (auto-deploy on `main`).
- API → Railway (auto-deploy on `main`).
- Postgres, Redis → Railway (managed).
- Static assets, PDFs → Cloudflare R2 (S3-compatible, cheaper egress than S3).

---

## 14. Working Style Expectations

- **Ask before rewriting.** If you'd touch more than 5 files or change an architectural pattern, ask first.
- **Small, reviewable PRs.** One feature, one PR. No 2000-line diffs.
- **Explain trade-offs.** When you make a design choice with alternatives, note them in the PR description.
- **Flag scope creep.** If a task grows beyond what was asked, stop and confirm before continuing.
- **Update this file when patterns emerge.** New convention discovered? Add it here.
