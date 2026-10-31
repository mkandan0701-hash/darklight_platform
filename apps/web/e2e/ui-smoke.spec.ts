import { expect, test } from "@playwright/test";
import { buildNav } from "../components/dashboard/shell/navLinks";
import { expectNoHorizontalOverflow, qa, storageFor, watchForErrors, type RoleKey } from "./fixtures";

// Every page in each role's sidebar, at the viewport of whichever project runs
// this (desktop / tablet / phone): it must load without a 5xx, without a
// console error, and without making the page scroll sideways.

const ROLES: [RoleKey, Parameters<typeof buildNav>[0]][] = [
  ["admin", "ACADEMY_ADMIN"],
  ["coachA", "COACH"],
  ["studentB", "STUDENT"],
  ["parentP", "PARENT"],
];

// Pages the sidebar doesn't list but people land on.
const EXTRA: Partial<Record<RoleKey, string[]>> = {
  admin: [`/dashboard/classrooms/${qa.rooms.main}`, "/dashboard/calendar?view=week", "/dashboard/calendar?view=day"],
  parentP: [`/dashboard/children/${qa.users.studentB.profileId}`, "/dashboard/calendar?view=agenda"],
};

for (const [key, role] of ROLES) {
  const hrefs = [
    ...buildNav(role)
      .flatMap((s) => s.items)
      .flatMap((i) => (i.kind === "link" ? [i.href] : [])),
    ...(EXTRA[key] ?? []),
  ];

  test.describe(`${key} pages`, () => {
    test.use({ storageState: storageFor(key) });
    for (const href of hrefs) {
      test(href, async ({ page }) => {
        const watch = watchForErrors(page);
        const res = await page.goto(href);
        expect(res?.status(), `${href} status`).toBeLessThan(400);
        await page.waitForLoadState("networkidle");
        await expect(page.locator("h1").first()).toBeVisible();
        await expectNoHorizontalOverflow(page);
        watch.assertClean();
      });
    }
  });
}
