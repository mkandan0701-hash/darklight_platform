import { defineConfig } from "vitest/config";

// Mirrors packages/db/vitest.integration.config.ts. Separate from
// vitest.config.ts so the default `npm run test` needs no database.
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.integration.test.ts"],
    exclude: ["node_modules", ".next"],
    // One shared database: parallel files would let one file's cleanup delete
    // another's fixtures mid-assertion.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
