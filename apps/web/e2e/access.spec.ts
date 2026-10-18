import { expect, test, type Page } from "@playwright/test";
import { qa, storageFor, type RoleKey } from "./fixtures";

// Authorization by URL tampering: each role tries pages and ids it must not
// reach. "Denied" means a 404 / not-found page or a redirect — never the data,
// and never a 500.

async function as(role: RoleKey, browser: import("@playwright/test").Browser) {
  const ctx = await browser.newContext({ storageState: storageFor(role) });
  return { ctx, page: await ctx.newPage() };
}

async function expectDenied(page: Page, path: string, mustNotContain: RegExp) {
  const res = await page.goto(path);
  const status = res?.status() ?? 0;
  expect(status, `${path} returned ${status}`).toBeLessThan(500);
  await expect(page.locator("body")).not.toContainText(mustNotContain);
}

test.describe("role and record isolation", () => {
  test("coach Z can't open coach A's classroom, attendance or sessions", async ({ browser }) => {
    const { ctx, page } = await as("coachZ", browser);
    await expectDenied(page, `/dashboard/classrooms/${qa.rooms.main}`, /QA Student Bala/);
    await expectDenied(page, `/dashboard/attendance/${qa.rooms.main}`, /QA Student Bala/);
    await page.goto("/dashboard/classrooms");
    await expect(page.locator("body")).not.toContainText("QA Saturday Juniors");
    await expect(page.locator("body")).toContainText("QA Zara's Endgames");
    await ctx.close();
  });

  test("student C can't see student B's classroom or record", async ({ browser }) => {
    const { ctx, page } = await as("studentC", browser);
    await expectDenied(page, `/dashboard/classrooms/${qa.rooms.main}`, /QA Saturday Juniors/);
    await page.goto("/dashboard/classrooms");
    await expect(page.locator("body")).not.toContainText("QA Saturday Juniors");
    await ctx.close();
  });

  test("parent Q can't open parent P's child", async ({ browser }) => {
    const { ctx, page } = await as("parentQ", browser);
    await expectDenied(page, `/dashboard/children/${qa.users.studentB.profileId}`, /QA Student Bala/);
    // A forged ?child= falls back to the parent's own child.
    await page.goto(`/dashboard/calendar?child=${qa.users.studentB.profileId}`);
    await expect(page.locator("body")).not.toContainText("QA Saturday Juniors");
    await ctx.close();
  });

  test("parent P can open their own child", async ({ browser }) => {
    const { ctx, page } = await as("parentP", browser);
    const res = await page.goto(`/dashboard/children/${qa.users.studentB.profileId}`);
    expect(res?.status()).toBe(200);
    await expect(page.locator("body")).toContainText("QA Student Bala");
    await ctx.close();
  });

  for (const role of ["coachA", "studentB", "parentP"] as const) {
    test(`${role} is refused admin-only pages without a server error`, async ({ browser }) => {
      const { ctx, page } = await as(role, browser);
      for (const path of ["/dashboard/members", "/dashboard/settings"]) {
        await expectDenied(page, path, /Invite|Branding|qa-[0-9a-f]+-admin@/);
      }
      await ctx.close();
    });
  }

  test("students don't receive classmates' emails anywhere on the calendar page", async ({ browser }) => {
    const { ctx, page } = await as("studentB", browser);
    await page.goto("/dashboard/calendar?view=agenda");
    const html = await page.content();
    // Their own address appears in the account menu; nobody else's may.
    for (const key of ["admin", "coachA", "coachZ", "studentC", "parentP", "parentQ"] as const) {
      expect(html, key).not.toContain(qa.users[key].email);
    }
    await ctx.close();
  });
});
