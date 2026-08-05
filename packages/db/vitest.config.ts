import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // *.integration.test.ts also matches the glob above, and needs a live
    // Postgres. Without this exclusion `npm run test` fails on any machine
    // that doesn't have one — which is every machine except CI.
    exclude: ["**/node_modules/**", "**/dist/**", "src/**/*.integration.test.ts"],
  },
});
