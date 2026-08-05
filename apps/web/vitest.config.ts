import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    // *.integration.test.ts also matches the glob and needs a live Postgres,
    // so `npm run test` would fail on any machine without one — which is every
    // machine except CI. They run via `npm run test:integration`.
    exclude: ["node_modules", ".next", "**/*.integration.test.ts"],
  },
});
