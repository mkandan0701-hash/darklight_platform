import { test as setup } from "@playwright/test";
import { loginViaForm, storageFor, type RoleKey } from "./fixtures";

// Signs each QA user in once through the real login form and saves the
// session, so the journey specs start authenticated as the right person.
const ROLES: RoleKey[] = ["admin", "coachA", "coachZ", "studentB", "studentC", "parentP", "parentQ"];

for (const role of ROLES) {
  setup(`sign in ${role}`, async ({ page }) => {
    await loginViaForm(page, role);
    await page.context().storageState({ path: storageFor(role) });
  });
}
