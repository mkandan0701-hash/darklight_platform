import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { qa, storageFor, watchForErrors, type RoleKey } from "./fixtures";
import { db } from "./db";

// Create → Assign → Read → Update → Reschedule → Cancel → Verify, across all
// four roles, checked in the database as well as on screen. Fixed future dates
// so results don't depend on today: Sat 7 Nov 2026 is the first Saturday after
// US clocks fall back (1 Nov), so 6:00 PM IST must read 7:30 AM in New York.

test.describe.configure({ mode: "serial" });

const DAY = "2026-11-07";
const ROOM = "QA Saturday Juniors";

async function as(browser: Browser, role: RoleKey) {
  const ctx = await browser.newContext({ storageState: storageFor(role) });
  const page = await ctx.newPage();
  return { ctx, page, errors: watchForErrors(page) };
}

async function openAgenda(page: Page, date = DAY) {
  await page.goto(`/dashboard/calendar?view=agenda&date=${date}`);
  await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
}

async function sessionsOnDay(date: string) {
  const prisma = await db();
  return prisma.liveSession.findMany({
    where: {
      tenantId: qa.tenantId,
      classroomId: qa.rooms.main,
      scheduledAtUtc: { gte: new Date(`${date}T00:00:00Z`), lt: new Date(`${date}T23:59:59Z`) },
    },
    include: { changes: true },
    orderBy: { scheduledAtUtc: "asc" },
  });
}

async function createClass(page: Page, opts: { date: string; time: string; repeat?: string; count?: number }) {
  await page.getByRole("button", { name: /new/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Classroom/).selectOption({ label: ROOM });
  await dialog.getByLabel(/^Date/).fill(opts.date);
  await dialog.getByLabel(/^Start time/).fill(opts.time);
  await dialog.getByLabel(/^Timezone/).selectOption("Asia/Kolkata");
  if (opts.repeat) {
    await dialog.getByLabel(/^Repeat/).selectOption(opts.repeat);
    if (opts.count) await dialog.getByLabel(/^Classes/).fill(String(opts.count));
  }
  await dialog.getByRole("button", { name: "Schedule" }).click();
  return dialog;
}

test("admin schedules a one-off class; it lands in the database at the right UTC instant", async ({ browser }) => {
  const { ctx, page, errors } = await as(browser, "admin");
  await openAgenda(page);
  await createClass(page, { date: DAY, time: "18:00" });
  await expect(page.getByText("Class scheduled")).toBeVisible();

  const rows = await sessionsOnDay(DAY);
  expect(rows).toHaveLength(1);
  expect(rows[0].scheduledAtUtc.toISOString()).toBe("2026-11-07T12:30:00.000Z");
  expect(rows[0].timezone).toBe("Asia/Kolkata");
  expect(rows[0].changes.map((c) => c.kind)).toEqual(["CREATED"]);
  errors.assertClean();
  await ctx.close();
});

test("the coach, the student (in New York time) and their parent all see it", async ({ browser }) => {
  for (const role of ["coachA", "parentP"] as const) {
    const { ctx, page } = await as(browser, role);
    await openAgenda(page);
    await expect(page.getByText(ROOM).first(), role).toBeVisible();
    await ctx.close();
  }
  const { ctx, page, errors } = await as(browser, "studentB");
  await openAgenda(page);
  await expect(page.getByText(ROOM).first()).toBeVisible();
  // Student B's profile zone is America/New_York.
  await expect(page.getByText("7:30 AM – 8:30 AM")).toBeVisible();
  errors.assertClean();
  await ctx.close();
});

test("an unrelated coach, student and parent don't", async ({ browser }) => {
  for (const role of ["coachZ", "studentC", "parentQ"] as const) {
    const { ctx, page } = await as(browser, role);
    await openAgenda(page);
    await expect(page.locator("main, body").first(), role).not.toContainText(ROOM);
    await ctx.close();
  }
});

test("coach A reschedules it; the change is audited and everyone sees the new time", async ({ browser }) => {
  const { ctx, page, errors } = await as(browser, "coachA");
  await page.goto(`/dashboard/calendar?view=day&date=${DAY}`);
  await page.getByRole("button", { name: ROOM }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Reschedule" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Start time/).fill("19:00");
  await dialog.getByLabel(/^Timezone/).selectOption("Asia/Kolkata");
  await dialog.getByRole("button", { name: "Reschedule" }).click();
  await expect(page.getByText("Class rescheduled")).toBeVisible();
  errors.assertClean();
  await ctx.close();

  const [row] = await sessionsOnDay(DAY);
  expect(row.scheduledAtUtc.toISOString()).toBe("2026-11-07T13:30:00.000Z");
  expect(row.changes.map((c) => c.kind).sort()).toEqual(["CREATED", "RESCHEDULED"]);

  const student = await as(browser, "studentB");
  await openAgenda(student.page);
  await expect(student.page.getByText("8:30 AM – 9:30 AM")).toBeVisible();
  await expect(student.page.getByText("Rescheduled").first()).toBeVisible();
  await student.ctx.close();
});

test("a clashing class is caught; a coach can't override, an admin can, and it's audited", async ({ browser }) => {
  const coach = await as(browser, "coachA");
  await openAgenda(coach.page);
  const coachDialog = await createClass(coach.page, { date: DAY, time: "19:30" });
  await expect(coachDialog.getByText(/clashes/i)).toBeVisible();
  await expect(coachDialog.getByRole("button", { name: "Save anyway" })).toHaveCount(0);
  await coach.ctx.close();
  expect(await sessionsOnDay(DAY)).toHaveLength(1);

  const admin = await as(browser, "admin");
  await openAgenda(admin.page);
  const dialog = await createClass(admin.page, { date: DAY, time: "19:30" });
  await expect(dialog.getByText(/already teaching/i).first()).toBeVisible();
  await dialog.getByRole("button", { name: "Save anyway" }).click();
  await expect(admin.page.getByText("Class scheduled")).toBeVisible();
  await admin.ctx.close();

  const rows = await sessionsOnDay(DAY);
  expect(rows).toHaveLength(2);
  const created = rows.find((r) => r.scheduledAtUtc.toISOString() === "2026-11-07T14:00:00.000Z")!;
  expect(created.changes[0]).toMatchObject({ kind: "CREATED", conflictOverride: true });
});

test("admin cancels the clash; every participant sees it cancelled, and nothing is deleted", async ({ browser }) => {
  const { ctx, page, errors } = await as(browser, "admin");
  await page.goto(`/dashboard/calendar?view=agenda&date=${DAY}`);
  // The 7:30 PM one (second in the list).
  await page.getByRole("button", { name: ROOM }).nth(1).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel class" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel class" }).click();
  await expect(page.getByText("Class cancelled")).toBeVisible();
  errors.assertClean();
  await ctx.close();

  const rows = await sessionsOnDay(DAY);
  expect(rows).toHaveLength(2);
  expect(rows.map((r) => r.status)).toEqual(["SCHEDULED", "CANCELLED"]);

  const parent = await as(browser, "parentP");
  await openAgenda(parent.page);
  await expect(parent.page.getByText("Cancelled").first()).toBeVisible();
  await parent.ctx.close();
});

test("a weekly series creates exactly its occurrences, survives refresh, and edits scope correctly", async ({ browser }) => {
  const { ctx, page, errors } = await as(browser, "admin");
  await openAgenda(page, "2026-11-14");
  await createClass(page, { date: "2026-11-14", time: "10:00", repeat: "WEEKLY", count: 3 });
  await expect(page.getByText("3 classes scheduled")).toBeVisible();
  await page.reload();

  const prisma = await db();
  const series = await prisma.liveSession.findMany({
    where: { tenantId: qa.tenantId, classroomId: qa.rooms.main, scheduledAtUtc: { gte: new Date("2026-11-14T00:00:00Z") } },
    orderBy: { scheduledAtUtc: "asc" },
  });
  expect(series).toHaveLength(3);
  expect(new Set(series.map((s) => s.seriesId)).size).toBe(1);
  expect(series.map((s) => s.scheduledAtUtc.toISOString())).toEqual([
    "2026-11-14T04:30:00.000Z",
    "2026-11-21T04:30:00.000Z",
    "2026-11-28T04:30:00.000Z",
  ]);

  // Move only the middle one.
  await page.goto("/dashboard/calendar?view=day&date=2026-11-21");
  await page.getByRole("button", { name: ROOM }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Reschedule" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Start time/).fill("11:00");
  await dialog.getByLabel(/^Timezone/).selectOption("Asia/Kolkata");
  await dialog.getByLabel(/this class only/i).check();
  await dialog.getByRole("button", { name: "Reschedule" }).click();
  await expect(page.getByText("Class rescheduled")).toBeVisible();

  let after = await prisma.liveSession.findMany({ where: { id: { in: series.map((s) => s.id) } }, orderBy: { scheduledAtUtc: "asc" } });
  expect(after.map((s) => s.scheduledAtUtc.toISOString())).toEqual([
    "2026-11-14T04:30:00.000Z",
    "2026-11-21T05:30:00.000Z",
    "2026-11-28T04:30:00.000Z",
  ]);

  // Then the first and everything after it to 9:00.
  await page.goto("/dashboard/calendar?view=day&date=2026-11-14");
  await page.getByRole("button", { name: ROOM }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Reschedule" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Start time/).fill("09:00");
  await dialog.getByLabel(/^Timezone/).selectOption("Asia/Kolkata");
  await dialog.getByLabel(/this and following/i).check();
  await dialog.getByRole("button", { name: "Reschedule" }).click();
  await expect(page.getByText("3 classes rescheduled")).toBeVisible();

  after = await prisma.liveSession.findMany({ where: { id: { in: series.map((s) => s.id) } }, orderBy: { scheduledAtUtc: "asc" } });
  expect(after.map((s) => s.scheduledAtUtc.toISOString())).toEqual([
    "2026-11-14T03:30:00.000Z",
    "2026-11-21T03:30:00.000Z",
    "2026-11-28T03:30:00.000Z",
  ]);
  errors.assertClean();
  await ctx.close();
});

test("coach marks attendance on a held class; the student earns XP and tops the leaderboard", async ({ browser }) => {
  const prisma = await db();
  const past = new Date(Date.now() - 2 * 86_400_000);
  const id = randomUUID();
  // The UI won't book a class two days ago, so this one fixture is direct.
  await prisma.liveSession.create({
    data: { id, tenantId: qa.tenantId, classroomId: qa.rooms.main, scheduledAtUtc: past, durationMins: 60, socketRoomId: id },
  });

  const coach = await as(browser, "coachA");
  await coach.page.goto(`/dashboard/attendance/${qa.rooms.main}/${id}`);
  await expect(coach.page.getByText("QA Student Bala")).toBeVisible();
  await coach.page.getByRole("button", { name: "Save attendance" }).click();
  await expect(coach.page.getByText("Saved.", { exact: true })).toBeVisible();
  coach.errors.assertClean();
  await coach.ctx.close();

  const record = await prisma.attendanceRecord.findFirst({ where: { liveSessionId: id, studentId: qa.users.studentB.profileId! } });
  expect(record?.present).toBe(true);
  const xp = await prisma.xpEvent.findMany({ where: { tenantId: qa.tenantId, studentId: qa.users.studentB.profileId! } });
  expect(xp.map((x) => x.kind)).toContain("SESSION_ATTENDED");

  const student = await as(browser, "studentB");
  await student.page.goto("/dashboard/leaderboard?period=week");
  const row = student.page.getByRole("listitem").filter({ hasText: "QA Student Bala" });
  await expect(row).toContainText("(you)");
  // The board must agree with the ledger, however many runs have attended.
  const attended = xp.filter((x) => x.kind === "SESSION_ATTENDED").length;
  const total = xp.reduce((sum, x) => sum + x.points, 0);
  await expect(row).toContainText(`${attended} ${attended === 1 ? "class" : "classes"}`);
  await expect(row).toContainText(`${total}XP`);
  await expect(row.getByLabel("Rank 1")).toBeVisible();
  student.errors.assertClean();
  await student.ctx.close();
});
