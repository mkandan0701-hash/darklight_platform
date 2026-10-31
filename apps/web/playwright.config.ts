import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";

// End-to-end suite against a running dev server and a throwaway QA academy.
//
//   1. QA_FIXTURE_FILE=<path> npx tsx --env-file=.env.local scripts/qa/seedQaTenant.mts
//   2. npm run dev            (in another terminal)
//   3. QA_FIXTURE_FILE=<path> npm run test:e2e
//   4. QA_FIXTURE_FILE=<path> npx tsx --env-file=.env.local scripts/qa/teardownQaTenant.mts
//
// Everything runs on the QA tenant's own subdomain; *.localhost resolves to
// loopback inside Chromium, so no hosts-file edits are needed.

const fixtureFile = process.env.QA_FIXTURE_FILE ?? "qa-fixture.json";
const { subdomain } = JSON.parse(readFileSync(fixtureFile, "utf8")) as { subdomain: string };
const port = process.env.PORT ?? "3000";

export default defineConfig({
  testDir: "./e2e",
  // One shared academy and a dev server compiling on demand: serial is the
  // honest setting, and generous timeouts absorb first-hit compiles.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"]],
  outputDir: process.env.QA_OUTPUT_DIR ?? "test-results",
  use: {
    baseURL: `http://${subdomain}.localhost:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      dependencies: ["setup"],
    },
    {
      name: "tablet",
      use: { ...devices["Desktop Chrome"], viewport: { width: 820, height: 1180 }, hasTouch: true },
      dependencies: ["setup"],
      testMatch: /ui-smoke\.spec\.ts/,
    },
    {
      name: "phone",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
      dependencies: ["setup"],
      testMatch: /ui-smoke\.spec\.ts/,
    },
  ],
});
