import { expect, test } from "@playwright/test";
import { loginViaForm, qa } from "./fixtures";

test.describe("authentication", () => {
  test("rejects a wrong password and stays on /login", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(qa.users.admin.email);
    await page.locator('input[name="password"]').fill("definitely-wrong-password");
    await page.getByRole("button", { name: /log in|sign in/i }).click();
    await expect(page.getByText(/invalid/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("won't submit an empty form", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /log in|sign in/i }).click();
    await expect(page).toHaveURL(/\/login/);
    const valid = await page.locator('input[name="email"]').evaluate((el: HTMLInputElement) => el.validity.valid);
    expect(valid).toBe(false);
  });

  test("redirects an anonymous visitor away from protected pages", async ({ page }) => {
    for (const path of ["/dashboard", "/dashboard/calendar", "/dashboard/members", "/dashboard/billing"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login/);
    }
  });

  test("session survives a refresh, and logout ends it", async ({ page }) => {
    await loginViaForm(page, "coachA");
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.getByRole("button", { expanded: false }).filter({ hasText: /QA Coach Anand/ }).click();
    await page.getByRole("menuitem", { name: "Log out" }).click();
    await page.waitForURL(/\/login/);
    await page.goto("/dashboard/calendar");
    await expect(page).toHaveURL(/\/login/);
  });

  test("an account from this academy can't sign in to another academy's subdomain", async ({ page, baseURL }) => {
    const other = baseURL!.replace(qa.subdomain, "demo-academy");
    await page.goto(`${other}/login`);
    await page.locator('input[name="email"]').fill(qa.users.studentB.email);
    await page.locator('input[name="password"]').fill(qa.password);
    await page.getByRole("button", { name: /log in|sign in/i }).click();
    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/tenant_mismatch|\/login/);
    await page.goto(`${other}/dashboard`);
    await expect(page).toHaveURL(/\/login/);
  });
});
