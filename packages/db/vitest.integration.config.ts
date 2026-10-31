import { defineConfig } from "vitest/config";

// Separate from vitest.config.ts so `npm run test` stays runnable on a laptop
// with no database. The default config's include glob deliberately does not
// match *.integration.test.ts.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    // Aborts the run if DATABASE_URL isn't a disposable database. These files
    // delete rows; this file is shared with prisma migrate and studio.
    setupFiles: ["./testing/requireDisposableDatabase.ts"],
    // These share one Postgres database. Running files in parallel would let
    // one file's cleanup delete another's fixtures mid-assertion.
    fileParallelism: false,
    // A first connection to a cold container is slower than the 5s default.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
