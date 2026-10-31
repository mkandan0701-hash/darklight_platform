import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalOverflow, storageFor, watchForErrors } from "./fixtures";

// The auth pages' presentation: styles and fonts actually load, the hero
// photo actually loads, nothing scrolls sideways at the widths we design for,
// and the password UI behaves. Behavioural auth (wrong password, redirects,
// tenant isolation) stays in auth.spec.ts.
//
// The set-password tests never submit a valid pair — the QA users' passwords
// are shared by every other spec, so changing one would break the run.

const WIDTHS = [375, 390, 768, 1024, 1440];

async function expectStyled(page: Page) {
  const styles = await page.evaluate(() => ({
    sheets: Array.from(document.styleSheets).filter((s) => s.href?.includes("/_next/static/css/")).length,
    body: getComputedStyle(document.body).fontFamily,
    inputHeight: document.querySelector("input:not([hidden])")?.getBoundingClientRect().height ?? 0,
  }));
  // The original bug: the stylesheet 404'd, leaving Times New Roman and 20px inputs.
  expect(styles.sheets, "app stylesheet attached").toBeGreaterThan(0);
  expect(styles.body).toMatch(/Inter/);
  expect(styles.inputHeight).toBeGreaterThanOrEqual(44);
}

async function expectHeroLoaded(page: Page) {
  const hero = page.getByRole("img", { name: /children playing chess/i });
  await expect(hero).toBeVisible();
  await expect
    .poll(() => hero.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true);
}

test.describe("auth pages: layout", () => {
  for (const path of ["/login", "/login?error=expired_link", "/signup"]) {
    test(`${path} renders styled with no overflow at every width`, async ({ page }) => {
      const watch = watchForErrors(page);
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
        await page.goto(path);
        await expectStyled(page);
        await expectHeroLoaded(page);
        await expectNoHorizontalOverflow(page);
        // On a phone the form, not the photo, is what's on screen first.
        await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
      }
      watch.assertClean();
    });
  }

  test("an expired-link notice is announced", async ({ page }) => {
    await page.goto("/login?error=expired_link");
    // Scoped to <main>: Next's route announcer is also role="alert".
    await expect(page.getByRole("main").getByRole("alert")).toContainText(/expired/i);
  });
});

test.describe("auth pages: password field", () => {
  test("show/hide flips the input type and is keyboard reachable", async ({ page }) => {
    await page.goto("/login");
    const password = page.locator('input[name="password"]');
    await expect(password).toHaveAttribute("type", "password");

    await page.locator('input[name="email"]').focus();
    await page.keyboard.press("Tab");
    await expect(password).toBeFocused();
    await page.keyboard.press("Tab");
    const toggle = page.getByRole("button", { name: "Show password" });
    await expect(toggle).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(password).toHaveAttribute("type", "text");
    await expect(page.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
    // The toggle is type="button": pressing it must not have submitted the form.
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("set-password", () => {
  test.describe("as a student", () => {
    test.use({ storageState: storageFor("studentB") });

    test("renders the activation page for the signed-in user", async ({ page }) => {
      const watch = watchForErrors(page);
      await page.goto("/set-password");
      await expect(page.getByRole("heading", { name: "Create your password" })).toBeVisible();
      await expect(page.getByText(/starting your chess journey/)).toBeVisible();
      await expectStyled(page);
      await expectHeroLoaded(page);
      // No way off the page mid-activation: the brand mark isn't a link.
      await expect(page.getByRole("link")).toHaveCount(0);
      watch.assertClean();
    });

    test("a mismatch is caught inline and never reaches the server", async ({ page }) => {
      await page.goto("/set-password");
      const actionPosts: string[] = [];
      page.on("request", (r) => {
        if (r.method() === "POST" && r.headers()["next-action"]) actionPosts.push(r.url());
      });

      await page.locator('input[name="password"]').fill("Knight-fork-2026");
      await page.locator('input[name="confirmPassword"]').fill("Knight-fork-2025");
      await page.getByRole("button", { name: "Save password and continue" }).click();

      const confirm = page.locator('input[name="confirmPassword"]');
      await expect(page.getByText("These passwords don't match yet.")).toBeVisible();
      await expect(confirm).toHaveAttribute("aria-invalid", "true");
      await expect(confirm).toBeFocused();
      await expect(page).toHaveURL(/\/set-password$/);
      expect(actionPosts).toEqual([]);
    });

    test("a too-short password is explained, with the rule shown", async ({ page }) => {
      await page.goto("/set-password");
      await page.locator('input[name="password"]').fill("short");
      await page.locator('input[name="confirmPassword"]').fill("short");
      await page.getByRole("button", { name: "Save password and continue" }).click();
      await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
      await expect(page.getByText("Too short")).toBeVisible();
    });
  });

  test.describe("as a parent", () => {
    test.use({ storageState: storageFor("parentP") });

    test("speaks to the parent, not the child", async ({ page }) => {
      await page.goto("/set-password");
      await expect(page.getByText(/follow your child's lessons/)).toBeVisible();
      await expect(page.getByText(/starting your chess journey/)).toHaveCount(0);
    });
  });
});
