# ChessPlay-Equivalent Diaspora Chess Academy SaaS — Technical Spec

Companion to `CLAUDE.md`. This is the full technical spec referenced there: Prisma
schema, API surface, realtime architecture, and infra cost model. `CLAUDE.md` holds
the summarized rules; this doc holds the detail that makes them buildable.

---

## 1. Prisma Schema

Conventions used throughout:
- Every tenant-owned model has `tenantId String` + `@@index([tenantId])`. Never query
  these models without a tenant filter (enforced via Prisma middleware, see §1.4).
- Soft delete: `deletedAt DateTime?` on every user-facing model. No hard deletes.
- All money: `amount Int` (smallest currency unit) + `currency String` (ISO 4217).
- All timestamps: `DateTime` stored in UTC by Postgres/Prisma default; never store
  pre-converted local time.

### 1.1 Core tenancy & identity

```prisma
model Tenant {
  id          String   @id @default(cuid())
  name        String
  subdomain   String   @unique
  logoUrl     String?
  brandColor  String?  // hex, used for admin/parent portal theming
  timezone    String   // default tenant timezone (IANA), e.g. "Asia/Kolkata"
  planTier    PlanTier @default(STARTER)
  createdAt   DateTime @default(now())
  deletedAt   DateTime?

  users        User[]
  classrooms   Classroom[]
  tournaments  Tournament[]
  invoices     Invoice[]

  @@index([subdomain])
}

enum PlanTier {
  STARTER   // $19/mo
  GROWTH    // $49/mo — primary build target
  PRO       // $99/mo
  ENTERPRISE
}

model User {
  id           String   @id @default(cuid())
  tenantId     String
  tenant       Tenant   @relation(fields: [tenantId], references: [id])
  email        String
  role         Role
  timezone     String   // IANA tz, defaults from Tenant but overridable per user
  authProviderId String @unique // Clerk/Supabase Auth external user id
  createdAt    DateTime @default(now())
  deletedAt    DateTime?

  coachProfile  CoachProfile?
  studentProfile StudentProfile?
  parentProfile ParentProfile?

  @@unique([tenantId, email])
  @@index([tenantId])
}

enum Role {
  ACADEMY_ADMIN
  COACH
  STUDENT
  PARENT
}

model CoachProfile {
  id       String @id @default(cuid())
  userId   String @unique
  user     User   @relation(fields: [userId], references: [id])
  tenantId String
  fideId   String?
  uscfId   String?
  eclId    String?
  bio      String?

  classrooms ClassroomCoach[]
  referenceBoards ReferenceBoard[]

  @@index([tenantId])
}

model StudentProfile {
  id            String @id @default(cuid())
  userId        String @unique
  user          User   @relation(fields: [userId], references: [id])
  tenantId      String
  dateOfBirth   DateTime?
  fideId        String?
  uscfId        String?
  eclId         String?
  lichessHandle String?
  chesscomHandle String?

  classrooms       ClassroomStudent[]
  parents          ParentStudent[]
  puzzleAttempts   PuzzleAttempt[]
  games            Game[]
  attendance       AttendanceRecord[]
  invoices         Invoice[]
  ratingRecords    RatingRecord[]
  certificates     Certificate[]

  @@index([tenantId])
}

model ParentProfile {
  id       String @id @default(cuid())
  userId   String @unique
  user     User   @relation(fields: [userId], references: [id])
  tenantId String
  phone    String? // for WhatsApp Business API

  children ParentStudent[]

  @@index([tenantId])
}

model ParentStudent {
  id        String        @id @default(cuid())
  tenantId  String
  parentId  String
  studentId String
  parent    ParentProfile   @relation(fields: [parentId], references: [id])
  student   StudentProfile  @relation(fields: [studentId], references: [id])

  @@unique([parentId, studentId])
  @@index([tenantId])
}
```

### 1.2 Classrooms, sessions, homework

```prisma
model Classroom {
  id          String   @id @default(cuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  name        String
  weekendFirst Boolean @default(true) // wedge default scheduling behavior
  createdAt   DateTime @default(now())
  deletedAt   DateTime?

  coaches     ClassroomCoach[]
  students    ClassroomStudent[]
  liveSessions LiveSession[]
  assignments  Assignment[]

  @@index([tenantId])
}

model ClassroomCoach {
  id          String   @id @default(cuid())
  tenantId    String
  classroomId String
  coachId     String
  classroom   Classroom    @relation(fields: [classroomId], references: [id])
  coach       CoachProfile @relation(fields: [coachId], references: [id])

  @@unique([classroomId, coachId])
  @@index([tenantId])
}

model ClassroomStudent {
  id          String   @id @default(cuid())
  tenantId    String
  classroomId String
  studentId   String
  classroom   Classroom      @relation(fields: [classroomId], references: [id])
  student     StudentProfile @relation(fields: [studentId], references: [id])
  enrolledAt  DateTime @default(now())

  @@unique([classroomId, studentId])
  @@index([tenantId])
}

model LiveSession {
  id           String   @id @default(cuid())
  tenantId     String
  classroomId  String
  classroom    Classroom @relation(fields: [classroomId], references: [id])
  scheduledAtUtc DateTime // always UTC; convert per-viewer in UI
  durationMins Int
  socketRoomId String   @unique // maps to Socket.io room `session:{roomId}`
  status       SessionStatus @default(SCHEDULED)

  referenceBoard   ReferenceBoard?
  attendance       AttendanceRecord[]

  @@index([tenantId])
}

enum SessionStatus {
  SCHEDULED
  LIVE
  COMPLETED
  CANCELLED
}

model ReferenceBoard {
  id            String   @id @default(cuid())
  tenantId      String
  liveSessionId String   @unique
  liveSession   LiveSession  @relation(fields: [liveSessionId], references: [id])
  coachId       String
  coach         CoachProfile @relation(fields: [coachId], references: [id])
  fen           String   // current board state, coach-only room `session:{roomId}:coach`

  @@index([tenantId])
}

model AttendanceRecord {
  id            String   @id @default(cuid())
  tenantId      String
  liveSessionId String
  studentId     String
  liveSession   LiveSession    @relation(fields: [liveSessionId], references: [id])
  student       StudentProfile @relation(fields: [studentId], references: [id])
  mode          AttendanceMode
  present       Boolean
  markedAtUtc   DateTime @default(now())

  @@unique([liveSessionId, studentId])
  @@index([tenantId])
}

enum AttendanceMode {
  ONLINE
  OFFLINE
}

model Assignment {
  id          String   @id @default(cuid())
  tenantId    String
  classroomId String
  classroom   Classroom @relation(fields: [classroomId], references: [id])
  title       String
  dueAtUtc    DateTime?
  createdAt   DateTime @default(now())

  puzzles     AssignmentPuzzle[]

  @@index([tenantId])
}
```

### 1.3 Puzzles, games, analysis

```prisma
model Puzzle {
  id          String   @id @default(cuid())
  // global reference data — NOT tenant-scoped, sourced from Lichess CC0 puzzle DB
  lichessId   String   @unique
  fen         String
  moves       String   // UCI move list, space-separated (solution line)
  rating      Int
  themes      String[] // e.g. ["fork", "endgame", "mateIn2"]

  assignments AssignmentPuzzle[]
  attempts    PuzzleAttempt[]
}

model AssignmentPuzzle {
  id           String   @id @default(cuid())
  tenantId     String
  assignmentId String
  puzzleId     String
  assignment   Assignment @relation(fields: [assignmentId], references: [id])
  puzzle       Puzzle     @relation(fields: [puzzleId], references: [id])

  @@unique([assignmentId, puzzleId])
  @@index([tenantId])
}

model PuzzleAttempt {
  id            String   @id @default(cuid())
  tenantId      String
  studentId     String
  puzzleId      String
  student       StudentProfile @relation(fields: [studentId], references: [id])
  puzzle        Puzzle         @relation(fields: [puzzleId], references: [id])
  attemptMoves  Json     // full move-by-move log, INCLUDING wrong tries — core differentiator
  isCorrect     Boolean
  timeTakenSecs Int
  attemptedAtUtc DateTime @default(now())

  @@index([tenantId])
  @@index([studentId, puzzleId])
}

model Game {
  id             String   @id @default(cuid())
  tenantId       String
  studentId      String
  student        StudentProfile @relation(fields: [studentId], references: [id])
  source         GameSource
  externalId     String?  // Lichess/Chess.com game id — idempotency key for sync
  pgn            String
  playedAtUtc    DateTime
  result         String   // "1-0" | "0-1" | "1/2-1/2"

  analysis       GameAnalysis?

  @@unique([source, externalId])
  @@index([tenantId])
}

enum GameSource {
  PLATFORM
  LICHESS
  CHESSCOM
}

model GameAnalysis {
  id          String   @id @default(cuid())
  tenantId    String
  gameId      String   @unique
  game        Game     @relation(fields: [gameId], references: [id])
  engineDepth Int
  accuracy    Float?
  blunders    Json     // list of {ply, evalBefore, evalAfter, move}
  completedAtUtc DateTime?
  status      AnalysisStatus @default(QUEUED) // BullMQ job status mirror

  @@index([tenantId])
}

enum AnalysisStatus {
  QUEUED
  RUNNING
  DONE
  FAILED
}
```

### 1.4 Billing

```prisma
model Invoice {
  id            String   @id @default(cuid())
  tenantId      String
  studentId     String
  student       StudentProfile @relation(fields: [studentId], references: [id])
  amount        Int      // smallest unit: cents (USD) or paise (INR)
  currency      String   // "USD" | "INR"
  provider      PaymentProvider
  providerRef   String   // Stripe PaymentIntent id or Razorpay order id
  fxRateApplied Float?   // only set when a conversion happened; store the rate used
  status        InvoiceStatus @default(PENDING)
  dueAtUtc      DateTime
  paidAtUtc     DateTime?

  @@index([tenantId])
  @@unique([provider, providerRef])
}

enum PaymentProvider {
  STRIPE
  RAZORPAY
}

enum InvoiceStatus {
  PENDING
  PAID
  FAILED
  REFUNDED
}
```

### 1.5 Wave 4: tournaments, simul, gamification, certificates

```prisma
model Tournament {
  id          String   @id @default(cuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  name        String
  format      TournamentFormat
  socketRoomId String  @unique // `tournament:{tournamentId}`
  startsAtUtc DateTime

  participants TournamentParticipant[]
  pairings     TournamentPairing[]

  @@index([tenantId])
}

enum TournamentFormat {
  SWISS
  ARENA
}

model TournamentParticipant {
  id           String @id @default(cuid())
  tenantId     String
  tournamentId String
  studentId    String
  tournament   Tournament @relation(fields: [tournamentId], references: [id])
  score        Float @default(0)

  @@unique([tournamentId, studentId])
  @@index([tenantId])
}

model TournamentPairing {
  id           String   @id @default(cuid())
  tenantId     String
  tournamentId String
  round        Int
  whiteId      String
  blackId      String?  // null = bye
  result       String?
  tournament   Tournament @relation(fields: [tournamentId], references: [id])

  @@index([tenantId])
}

model Simul {
  id         String   @id @default(cuid())
  tenantId   String
  coachId    String
  startsAtUtc DateTime

  boards     SimulBoard[]

  @@index([tenantId])
}

model SimulBoard {
  id           String @id @default(cuid())
  tenantId     String
  simulId      String
  boardIdx     Int
  studentId    String
  socketRoomId String @unique // `simul:{simulId}:{boardIdx}`
  simul        Simul  @relation(fields: [simulId], references: [id])

  @@unique([simulId, boardIdx])
  @@index([tenantId])
}

model RatingRecord {
  id         String   @id @default(cuid())
  tenantId   String
  studentId  String
  student    StudentProfile @relation(fields: [studentId], references: [id])
  federation Federation
  rating     Int
  recordedAtUtc DateTime @default(now())

  @@index([tenantId])
  @@index([studentId, federation])
}

enum Federation {
  FIDE
  USCF
  ECF
}

model Certificate {
  id          String   @id @default(cuid())
  tenantId    String
  studentId   String
  student     StudentProfile @relation(fields: [studentId], references: [id])
  type        CertificateType
  pdfUrl      String   // Cloudflare R2 object URL
  issuedAtUtc DateTime @default(now())

  @@index([tenantId])
}

enum CertificateType {
  ATTENDANCE
  RATING_MILESTONE
  TOURNAMENT_RESULT
}
```

### 1.6 Tenant-scoping middleware

Every repository function takes an explicit `tenantId` and every Prisma call for a
tenant-owned model is wrapped through a single Prisma Client extension so a missing
filter fails loudly instead of leaking cross-tenant data:

```ts
// repositories/prismaTenantExtension.ts
const TENANT_SCOPED_MODELS = new Set([
  'User', 'CoachProfile', 'StudentProfile', 'ParentProfile', 'ParentStudent',
  'Classroom', 'ClassroomCoach', 'ClassroomStudent', 'LiveSession',
  'ReferenceBoard', 'AttendanceRecord', 'Assignment', 'AssignmentPuzzle',
  'PuzzleAttempt', 'Game', 'GameAnalysis', 'Invoice', 'Tournament',
  'TournamentParticipant', 'TournamentPairing', 'Simul', 'SimulBoard',
  'RatingRecord', 'Certificate',
]);
// Extension throws if `where.tenantId` is absent on find/update/delete for these models.
```

`Tenant` and `Puzzle` are the only models exempt (global reference data).

---

## 2. API Surface

**Internal API**: Next.js Server Actions / tRPC routers, one per domain — `tenant`,
`user`, `classroom`, `assignment`, `puzzle`, `liveSession`, `attendance`, `invoice`,
`game`, `tournament`, `simul`, `certificate`. All inputs validated with Zod at the
router boundary. All procedures resolve `tenantId` from the authenticated session,
never from client-supplied input.

**External-facing REST** (webhooks + cron only — everything else stays internal):

| Route | Method | Purpose |
|---|---|---|
| `/api/webhooks/stripe` | POST | Payment success/failure/refund events → update `Invoice` |
| `/api/webhooks/razorpay` | POST | Same, INR path |
| `/api/webhooks/whatsapp` | POST | Delivery/read receipts, inbound parent replies |
| `/api/cron/lichess-sync` | POST (Railway cron) | Nightly game sync per student with a linked handle |
| `/api/cron/chesscom-sync` | POST (Railway cron) | Same, rate-limited to 300 req/5min/IP |
| `/api/cron/report-generation` | POST (Railway cron) | Enqueues monthly parent reports (Claude Batch) |

Webhook routes verify provider signatures before touching the DB (Stripe/Razorpay
signing secrets, Meta WhatsApp verify token). Never process an unverified webhook body.

---

## 3. Realtime Architecture (Socket.io)

### 3.1 Rooms

| Room | Members | Purpose |
|---|---|---|
| `session:{roomId}` | Coach + student(s) | Shared board sync, chat, arrows |
| `session:{roomId}:coach` | Coach only | Reference board (coach's prep material) |
| `simul:{simulId}:{boardIdx}` | Coach + one student | Parallel simul boards |
| `tournament:{tournamentId}` | Participants + spectators | Live pairings, results |

### 3.2 Join flow

1. Client connects with the auth session token (Clerk/Supabase JWT).
2. Server middleware decodes the JWT, loads `{ tenantId, role, userId }`, attaches to
   the socket.
3. On `join-room` request, server checks: does this socket's tenant/role/userId have
   access to the target room's underlying resource (`LiveSession.classroomId` →
   `ClassroomStudent`/`ClassroomCoach` membership)? Reject the join otherwise.
4. `:coach` room joins additionally require `role === COACH` on that specific
   `LiveSession`'s classroom — never trust a client-supplied "I am the coach" flag.

### 3.3 Events

Shared room (`session:{roomId}`): `move`, `draw-arrow`, `clear-arrows`, `flip-board`,
`game-state`, `chat-message`.

Coach-only room (`session:{roomId}:coach`): `ref-board-load`, `ref-board-move`,
`ref-board-clear`.

Every `move` event payload `{ from, to, promotion? }` is replayed server-side against
the authoritative `chess.js` game state for that session before being rebroadcast — a
rejected move never reaches other clients.

### 3.4 Scaling note

Railway will run more than one API instance once load requires it. Socket.io needs the
Redis adapter (`@socket.io/redis-adapter`) from Wave 2 onward so room broadcasts work
across instances — do not defer this to "later," it's a correctness issue the moment a
second instance exists, not just a performance one.

---

## 4. Cost Model

Rough monthly infra cost, scaling with paying-academy count (Growth tier assumed as
the modal customer):

| Item | ~10 academies | ~50 academies | ~200 academies |
|---|---|---|---|
| Vercel (frontend) | Free–$20 | $20 | $150 (Pro, team seats) |
| Railway (API + Postgres + Redis) | ~$20 | ~$60 | ~$250 (need to size Postgres/Redis) |
| Stockfish compute (server analysis, BullMQ workers) | ~$5 | ~$25 | ~$120 |
| Claude Haiku Batch API (monthly reports, 50% batch discount) | ~$3 | ~$15 | ~$60 |
| Resend (email) | Free (3k/mo) | ~$20 | ~$90 |
| WhatsApp Business API (Meta conversation pricing) | ~$10 | ~$50 | ~$200 |
| Cloudflare R2 (certificates, static assets) | ~$1 | ~$5 | ~$20 |
| **Total** | **~$60/mo** | **~$195/mo** | **~$890/mo** |

At the Growth tier ($49/mo), 50 academies ≈ $2,450 MRR against ~$195/mo infra —
healthy margin even before the ~$5k MRR Y2 target from the GTM plan is hit. Revisit
this table once real Stockfish/WhatsApp usage data exists; WhatsApp conversation
pricing in particular varies by country and template category and is the least
predictable line item.

---

## 5. Open Decisions

- **Auth provider**: Clerk vs Supabase Auth — must be resolved before Wave 1 auth work
  starts (see `CLAUDE.md` §2). Clerk is faster to multi-tenant-ify out of the box;
  Supabase Auth is cheaper at scale and keeps auth data in the same Postgres instance.
  Flag to the user before committing.
- **WhatsApp Business API provider**: direct Meta Cloud API vs a BSP (Twilio,
  Gupshup, etc.) — affects onboarding friction for business verification. Not yet
  decided; needed before Wave 3.
