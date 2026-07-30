---
name: chessplay-clone
description: Build and develop the ChessPlay-equivalent chess academy management SaaS platform — a standalone multi-tenant Next.js + Node.js product targeting diaspora chess academies (India-based coaches teaching NRI students in US/UK, and US/UK-based Indian coaches). Use this skill whenever the user mentions the ChessPlay clone, diaspora chess platform, chess academy SaaS, chess academy management platform, chessplay-equivalent, chesslang-clone, or any feature described in the project's CLAUDE.md — classrooms, live sessions, coach-only reference board, puzzle attempt tracking, homework, tournaments, simul, attendance, multi-currency invoicing, Stripe/Razorpay integration, WhatsApp parent updates, parent portal, Lichess/Chess.com sync, game analysis, gamification, college-app certificates, time-zone-aware scheduling, or the wave-based build order for this project. Also trigger for references like "the SaaS project", "the diaspora chess project", "the academy platform I'm selling", or when the user asks about pricing tiers ($19/$49/$99), the diaspora wedge, or the go-to-market plan for this product. Do NOT use this skill for the separate ChessGrowth / Darklight / ThinkOS project (that has its own skill) — this is a fully independent codebase and business.
---

# ChessPlay-Equivalent Diaspora Chess Academy SaaS

## Project Overview

Multi-tenant SaaS platform for chess academies, feature-parity with [ChessPlay.io](https://chessplay.io), positioned specifically for **diaspora chess academies** — India-based coaches teaching Indian-origin students in US/UK, and US/UK-based Indian coaches. Sold worldwide, priced in USD.

**This is a standalone project.** Fully separate from the user's ChessGrowth / Darklight / ThinkOS work. Do not import from, reference, or reuse code from those repos. Do not blur the two products when advising the user.

## Business Context (shapes technical decisions)

- **Target buyer:** chess coaches with 10–300 diaspora students.
- **Pricing tiers (USD):** Starter $19, Growth $49 (typical customer), Pro $99, Enterprise custom. Annual = 2 months free. Free 14-day trial, no card required.
- **Wedge:** the diaspora niche. Neither ChessPlay nor Chesslang specifically targets this segment.
- **Wedge features that must feel first-class, not afterthoughts:**
  1. Time-zone-aware scheduling (coach IST, student PST, parent EST — handle it).
  2. Multi-currency invoicing (Stripe USD from parents, Razorpay INR settlement for coaches).
  3. WhatsApp Business API for parent updates.
  4. Rich parent portal (NRI parents are more involved than average).
  5. Weekend-first classroom scheduling defaults.
  6. College-app-ready certificates (attendance, rating milestones, tournament results).
  7. Multi-federation rating tracking (FIDE + USCF + ECF).
- **TAM reality:** ~500–1,500 diaspora academies globally. Realistic Y2 outcome ~$5k MRR (~₹48 lakh ARR). Real niche business, not a rocketship.
- **Business status:** pre-launch. User needs LUT (GST export filing), Stripe India, `.com` domain, ToS/Privacy Policy that survive US courts. Total ~₹35–65k one-time legal cost.

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind |
| Board | `react-chessboard` + `chess.js` |
| Engine (client) | Stockfish WASM (play vs computer, analysis board) |
| Engine (server) | Stockfish binary (queued analysis jobs) |
| Realtime | Socket.io |
| Audio/Video | `simple-peer` (WebRTC) audio first; Agora video later |
| Backend | Node.js + Express, TypeScript |
| Database | PostgreSQL via Prisma |
| Cache/Queue | Redis + BullMQ |
| Auth | Clerk or Supabase Auth (TBD in Wave 1) |
| Payments | Stripe India (USD) + Razorpay (INR backup) |
| Email | Resend |
| AI (reports) | Claude Haiku via Batch API |
| Hosting | Vercel (frontend) + Railway (API + Postgres + Redis) |

Do not swap stack elements without asking the user first. Every choice was deliberate.

## Architectural Principles (Non-Negotiable)

1. **Multi-tenant from day one.** Every model except `Tenant` and global reference data (like `Puzzle`) has a `tenantId` foreign key. Every query filters by tenant via middleware. Never write an un-scoped query.
2. **Server-side authorization on every endpoint.** Roles: `ACADEMY_ADMIN`, `COACH`, `STUDENT`, `PARENT`. UI hiding a button is not security.
3. **Server-validated realtime moves.** Every `move` event is re-validated with `chess.js` on the server before broadcasting.
4. **Coach-only reference board isolation.** Uses a separate Socket.io room `session:{roomId}:coach` with role-gated joins. Never broadcast reference-board events to the shared room.
5. **Time zones are first-class.** UTC in DB. Every user has a `timezone`. UI converts to viewer's timezone, not sender's.
6. **Multi-currency from day one.** `Invoice.amount` stored in smallest unit of `Invoice.currency`. Never mix currencies without explicit conversion + stored rate.
7. **Async by default for expensive work.** Stockfish analysis, report generation, external syncs go through BullMQ.
8. **Idempotent external integrations.** Lichess/Chess.com sync uses `externalId` unique constraints on `Game`.

## Data Model Summary

Full Prisma schema is in `chessplay-clone-spec.md`. Key models:

- `Tenant` → owns `User`, `Classroom`, `Tournament`, `Invoice`
- `User` (roled) → has one of `CoachProfile` / `StudentProfile` / `ParentProfile`
- `Classroom` → many coaches (via `ClassroomCoach`), many students (via `ClassroomStudent`), many `LiveSession`, many `Assignment`
- `LiveSession` → optional `ReferenceBoard` (coach-only), many `AttendanceRecord`
- `Assignment` → many `Puzzle` (via `AssignmentPuzzle`)
- `PuzzleAttempt` → logs every attempt with `attemptMoves` (JSON of every move tried), `timeTakenSecs`, `isCorrect`
- `Game` (played or imported from Lichess/Chess.com) → optional `GameAnalysis`
- `Invoice` → Stripe or Razorpay identifiers, multi-currency
- `ParentStudent` → many-to-many parent ↔ student

Never hard-delete user-facing data. Use `deletedAt` soft-delete columns.

## Build Order (Waves — Strict Sequence)

**Wave 1 — Foundation**
- Multi-tenant auth, roles, subdomain routing.
- Academy admin dashboard, onboarding for coach/student/parent.
- Classrooms model + enrollment.
- Basic tenant branding (logo, color).

**Wave 2 — Teaching core + wedge features**
- Lichess CC0 puzzle DB import.
- Homework/quizzes with attempt logging (every move tried, not just final).
- Play vs Stockfish (WASM client).
- Analysis board.
- Live session: shared board + `simple-peer` audio.
- Coach-only reference board (separate socket room).
- Time-zone-aware scheduling. **(WEDGE — high priority)**
- Weekend-first classroom templates. **(WEDGE)**

**Wave 3 — Business ops + wedge features**
- Attendance (online + offline modes).
- Multi-currency invoicing (Stripe USD + Razorpay INR). **(WEDGE)**
- WhatsApp Business API for parent updates. **(WEDGE)**
- Parent portal (rich progress/attendance/homework). **(WEDGE)**
- Branded monthly parent reports (Claude Haiku Batch + Resend).

**Wave 4 — Engagement + certificates**
- Lichess & Chess.com game sync (nightly cron + BullMQ).
- Server-side game analysis (Stockfish queued).
- Tournaments (Swiss + Arena).
- Simul (parallel Socket.io rooms per board).
- Gamification (XP, badges, leaderboards).
- College-app certificate generator. **(WEDGE)**
- Multi-federation rating tracking (FIDE + USCF + ECF). **(WEDGE)**

Then video upgrade (Agora), mobile app decision at 20+ paying customers.

## Realtime Socket.io Rooms

| Room | Members | Purpose |
|---|---|---|
| `session:{roomId}` | Coach + student(s) | Shared board sync, chat, arrows |
| `session:{roomId}:coach` | Coach only | Reference board (coach's prep) |
| `simul:{simulId}:{boardIdx}` | Coach + one student | Parallel simul boards |
| `tournament:{tournamentId}` | Participants + spectators | Live pairings, results |

Enforce role checks on room joins server-side.

## External Integrations Quick Reference

| Integration | Auth | Notes |
|---|---|---|
| Lichess API | Public | CC0 puzzles, game import |
| Chess.com API | Public | 300 req / 5 min per IP |
| Stripe India | Secret key + webhooks | USD → INR settlement |
| Razorpay | Key + webhooks | INR backup |
| Resend | API key | 3,000/mo free |
| WhatsApp Business API | Meta business account | Requires business verification |
| Claude Batch API | Anthropic key | 50% off for report generation |

## What NOT to Build

Do not add these even if the user asks in passing — flag them as out of scope:
- Native mobile apps (Phase 2, ₹2–5 lakh, only after 20+ paying web customers).
- Video-first live sessions (Wave 2 is audio-only; Agora video is post-Wave 4).
- Public rating ladders outside classrooms.
- Social features (friends, followers, public profiles).
- Streaming / broadcast.
- Puzzle rush / puzzle battles.
- Opening explorer / master database.
- Anything for non-diaspora Indian or non-diaspora Western academies (phase 3 expansion, not now).

If a feature request doesn't fit the wedge or a wave, flag it before building.

## How to Help the User

The user (Manikandan, co-founder + head coach at Darklight Chess Academy, ~1720 FIDE, Next.js/Node background) is a solo builder running a full academy while building this. Expectations:

1. **Bias toward concrete next steps over discussion.** He prefers action-oriented guidance.
2. **Comprehensive single-prompt instructions.** He'd rather have a self-contained brief he can hand to Claude Code than a step-by-step chat back-and-forth.
3. **Flag scope creep and strategy drift.** He has pivoted wedges quickly. If he proposes changing the wedge, target market, or pricing after Wave 1 has begun, note the cost of the pivot before executing.
4. **Do not confuse this project with ChessGrowth / Darklight / ThinkOS.** Those are separate. He has an existing skill file for the other project (`chessgrowth` skill).
5. **Be honest about competitive reality.** ChessPlay has 150+ academies and 5 years head start. Chesslang since ~2019. Do not cheerlead. Give real trade-offs.
6. **Respect the wedge discipline.** Diaspora niche is the entire strategy. If a feature idea doesn't serve the diaspora buyer, it's probably out of scope for now.
7. **Never blur boundaries with his academy.** Darklight (his academy) is Customer #1 of this SaaS, not the SaaS itself. Advise as if these are two different companies.

## Reference Files (Should Live at Repo Root)

- `CLAUDE.md` — instructions for Claude Code coding sessions.
- `chessplay-clone-spec.md` — full technical spec: Prisma schema, API surface, realtime architecture, cost.
- `chessplay-clone-gtm-v2.md` — go-to-market plan: positioning, pricing, first 10 customers playbook, legal/payment infrastructure, TAM.

Read these when advising on architecture, feature scope, or business questions. Update them (as a separate step, flagged to the user) when the user makes decisions that change what they say.
