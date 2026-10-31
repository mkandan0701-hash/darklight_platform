import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, type Page } from "@playwright/test";

export type RoleKey = "admin" | "coachA" | "coachZ" | "studentB" | "studentC" | "parentP" | "parentQ";

export type QaFixture = {
  run: string;
  subdomain: string;
  tenantId: string;
  password: string;
  users: Record<RoleKey, { email: string; userId: string; profileId: string | null; role: string }>;
  rooms: { main: string; other: string };
};

const fixtureFile = process.env.QA_FIXTURE_FILE ?? "qa-fixture.json";
export const qa: QaFixture = JSON.parse(readFileSync(fixtureFile, "utf8"));

/** Saved sessions live next to the fixture, outside the repo. */
export const storageFor = (role: RoleKey) => join(dirname(fixtureFile), `qa-auth-${qa.run}-${role}.json`);

export async function loginViaForm(page: Page, role: RoleKey) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(qa.users[role].email);
  await page.locator('input[name="password"]').fill(qa.password);
  await page.getByRole("button", { name: /log in|sign in/i }).click();
  await page.waitForURL(/\/dashboard/);
}

/**
 * Fails the test on any uncaught page error, console error, or 5xx response —
 * a page that renders but throws in the console is not "working".
 */
export function watchForErrors(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    // Next dev-only noise, not app behaviour.
    if (/Download the React DevTools|\[Fast Refresh\]|webpack-hmr|favicon/i.test(text)) return;
    problems.push(`console: ${text.slice(0, 300)}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url()}`);
  });
  return {
    problems,
    assertClean: () => expect(problems, problems.join("\n")).toEqual([]),
  };
}

/** No horizontal page scroll at this viewport. */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "page scrolls horizontally").toBeLessThanOrEqual(1);
}
