# Go-To-Market Plan v2 — Diaspora Chess Academy SaaS

Companion to `CLAUDE.md` and `chessplay-clone-spec.md`. This is the business-side plan
referenced there: positioning, pricing, first-10-customers playbook, legal/payment
infrastructure, and TAM math. Keep this file honest — no cheerleading, real trade-offs.

---

## 1. Positioning

**Category**: chess academy management SaaS (scheduling, live teaching, homework,
attendance, billing, parent communication) — the same category as ChessPlay.io and
Chesslang.

**Wedge**: diaspora chess academies specifically —
1. India-based coaches teaching NRI (non-resident Indian) students in the US/UK.
2. US/UK-based Indian-origin coaches teaching diaspora students locally.

**Why this wedge, and not "chess academy software" broadly**: neither ChessPlay nor
Chesslang builds specifically for the diaspora relationship — a coach in Chennai at
9pm IST teaching a student in New Jersey at 11:30am EST, billed in USD, with a parent
in EST who wants WhatsApp updates and a certificate their kid can put on a US college
application. That combination of time-zone handling, multi-currency billing, WhatsApp
communication, and college-app certificates is not a checkbox feature — it's the
product's whole reason to exist. Generic academy software treats all four as edge
cases; here they're the default path.

**Positioning statement**: "The academy platform built for coaches teaching across
the diaspora — India ↔ US/UK — where the time zone, the currency, and the WhatsApp
message are the product, not an afterthought."

**Competitive reality** (state this plainly to the user whenever a pivot is
discussed): ChessPlay has 150+ academies and a 5-year head start; Chesslang has
existed since ~2019. Neither has meaningfully verticalized on diaspora needs — that's
the opening, not an absence of competition. This is a real niche business, not a
rocketship: TAM math below tops out around $5k MRR by Year 2 under the base case.

---

## 2. Ideal Customer Profile (ICP)

- Chess coach or small academy with **10–300 diaspora students**.
- Currently runs classes over Zoom/Google Meet + WhatsApp + a spreadsheet for
  attendance/billing, or a generic scheduling tool not built for chess.
- Either:
  - **India-based**, teaching students in US/UK time zones, wants to bill in USD
    without losing money to informal FX/wire fees, and wants parent communication
    that matches how Indian parents actually communicate (WhatsApp, not email).
  - **US/UK-based**, Indian-origin, serving the diaspora community locally, wants
    credibility features (certificates, multi-federation ratings) that resonate with
    parents optimizing for the student's college application.
- Not the ICP: large existing academies already deep in ChessPlay/Chesslang
  contracts (switching cost too high for a v1 wedge play); hobbyist single coaches
  with <10 students (won't pay $19+/mo yet); non-diaspora academies (phase 3, not now).

---

## 3. Pricing

| Tier | Price (USD/mo) | Target customer | What's included |
|---|---|---|---|
| Starter | $19 | Solo coach, <30 students | Classrooms, scheduling, basic homework, attendance |
| **Growth** | **$49** | **Small academy, ~50 students, one coach — build target** | + live session tooling, puzzle DB, multi-currency invoicing, parent portal |
| Pro | $99 | Multi-coach academy, 100–300 students | + tournaments/simul, WhatsApp integration, branded reports, certificates |
| Enterprise | Custom | 300+ students or multi-location | + custom branding, priority support, data export |

- **Annual discount**: 2 months free (effectively ~17% off) — standard SaaS
  annual-commit lever, improves cash flow and reduces churn measurement noise early on.
- **Free 14-day trial, no card required** — diaspora coaches are skeptical of new
  tools handling their billing; removing card-entry friction matters more than
  qualifying leads harder at this stage.
- Build the product for the **Growth tier** customer first (per `CLAUDE.md` §1) — a
  50-student single-coach academy is the modal case to optimize onboarding and
  defaults around, not the smallest or largest tier.

---

## 4. First 10 Customers Playbook

Diaspora coaches are a small, densely-networked population — word of mouth inside
that network outperforms broad-spectrum marketing at this stage.

1. **Customer #1: Darklight Chess Academy** (the user's own academy). This is a real
   customer, not a demo account — dogfooding surfaces onboarding friction and missing
   features before any outside coach sees them. Keep this relationship advisory-only
   at the business level (per `CLAUDE.md` §1: Darklight is Customer #1 of the SaaS,
   not the SaaS itself — don't blur the two companies in any external communication).
2. **Warm network outreach**: coaches personally known through the user's own
   coaching circles, FIDE/USCF tournament circuits, and Indian chess coaching
   WhatsApp/Telegram groups. Personal referral beats cold outreach for a trust-heavy,
   billing-adjacent product.
3. **Diaspora parent Facebook/WhatsApp groups**: NRI parent communities (by city —
   e.g. "Indian Parents of [US city]") are where the switching signal actually
   originates — a parent asking "does anyone know a good online chess coach for my
   kid" is a two-sided lead (parent + their existing/prospective coach).
4. **Lichess/Chess.com coach outreach**: coaches who list themselves as available for
   lessons on Lichess/Chess.com and mention US/UK student hours or NRI students in
   their bio are a directly targetable list.
5. **Case-study-first sales motion**: once Darklight and 2–3 early coaches are live,
   lead with their concrete before/after (e.g. "went from spreadsheet billing in 3
   currencies to automated Stripe+Razorpay invoicing") rather than a feature list —
   diaspora coaches buy on a peer's proof, not a demo.
6. **No paid acquisition in this phase.** At $49/mo ARPU and a ~500–1,500 academy
   TAM, paid channels don't pencil out until the product and referral loop are
   proven. Revisit after the first 10 paying customers, not before.

---

## 5. Legal & Payment Infrastructure (Pre-Launch Checklist)

Business status: **pre-launch**. These are blockers for accepting real customer
payments, tracked separately from the code build order in `CLAUDE.md`:

- [ ] **LUT (Letter of Undertaking)** for GST — required to export services (SaaS
  sold to US/UK customers) without charging/remitting Indian GST on those invoices.
- [ ] **Stripe India** account activated (per `CLAUDE.md` §2: Stripe India for USD
  collection from parents, Razorpay as the INR settlement/backup path for coaches).
- [ ] **`.com` domain** — needed before any customer-facing marketing or trial
  signup goes live.
- [ ] **Terms of Service / Privacy Policy** drafted to survive scrutiny in **US
  courts** specifically (not just Indian boilerplate) — the customer base and their
  card-holding parents are predominantly US/UK-based.
- **Estimated one-time legal cost**: ₹35,000–₹65,000 for the above (LUT filing +
  ToS/Privacy drafting). Budget this before the first paid pilot customer, not after.

None of these block writing code (Wave 1–2 can proceed in parallel), but all of them
block turning on real billing in Wave 3 — sequence legal/payment setup to land before
the multi-currency invoicing feature ships, not after.

---

## 6. TAM / SAM / SOM

- **TAM**: ~500–1,500 diaspora chess academies globally (India-based coaches with
  US/UK diaspora students, plus US/UK-based Indian-origin coaches). This is a rough,
  bottom-up estimate, not a licensed market report — revisit it once real signup data
  exists.
- **SAM**: academies already running some form of paid online instruction (not
  pure in-person) — a large majority of the TAM post-2020, since diaspora teaching is
  inherently remote.
- **SOM (realistic Year 2 outcome)**: **~$5k MRR** (~₹48 lakh ARR) at roughly 100
  paying academies blended across tiers, weighted toward Growth ($49). This is a real
  niche business, not a venture-scale one — hold this number in mind whenever
  evaluating whether a feature or a pivot is worth the build cost.
- **Implication for roadmap discipline**: because SOM is capped and modest, feature
  requests that don't serve the diaspora wedge or don't map to a wave should be
  flagged and declined by default (per `CLAUDE.md` §9) — there isn't a large enough
  addressable market to subsidize scope creep.

---

## 7. Risks

- **Incumbent response**: if ChessPlay or Chesslang notice the diaspora angle
  working, they could bolt on multi-currency/WhatsApp features faster than this
  product can build a moat. Mitigate by shipping the wedge features (time zones,
  multi-currency, WhatsApp, parent portal, certificates) early and deeply, not as
  afterthoughts — depth is the moat, not the feature checklist.
- **WhatsApp Business API friction**: Meta business verification is non-trivial and
  can stall onboarding; budget lead time before Wave 3, and pick a BSP if direct
  Meta Cloud API verification proves too slow (see open decision in the spec doc).
- **Founder bandwidth**: the user is a solo builder running a full academy
  simultaneously (per `CLAUDE.md`/skill.md "How to Help the User"). Realistic pacing
  matters more than an aggressive timeline — flag if the wave sequence is being
  compressed unrealistically.
- **Pivot cost**: the user has pivoted wedges quickly before. Any change to wedge,
  target market, or pricing after Wave 1 has begun should have its rebuild cost
  stated explicitly before executing (per `CLAUDE.md`/skill.md guidance).
