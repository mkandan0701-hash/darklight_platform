import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// tenantScope only sees queries made through the extended `prisma` client.
// Raw SQL and the unextended `prismaBase` go around it entirely, so where they
// may appear is a reviewed list, not a convention. Scripts, e2e fixtures and
// tests are not application code and are not scanned.

const REPO = resolve(__dirname, "../../..");
const SCANNED = ["apps/api/src", "apps/web/app", "apps/web/lib", "apps/web/repositories", "apps/web/components"];

// Each entry needs a reason a reviewer can check; see packages/db/src/index.ts.
const PRISMA_BASE_ALLOWED = new Set([
  // Resolves the session's User by authProviderId — the lookup that discovers tenantId.
  "apps/web/lib/auth/session.ts",
  // Resolve an invoice's real tenant from (provider, providerRef) before scoping.
  "apps/api/src/webhooks/stripe.ts",
  "apps/api/src/webhooks/razorpay.ts",
  // Nightly sweeps: list tenants (exempt model), then runWithTenant per tenant.
  "apps/api/src/games/gameSync.ts",
  "apps/api/src/workers/classroomScheduleMaterializeWorker.ts",
]);

const RAW_SQL = /\$(queryRaw|executeRaw)(Unsafe)?\b/;
const PRISMA_BASE = /\bprismaBase\b/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const files = SCANNED.flatMap((dir) => sourceFiles(join(REPO, dir))).map((path) => ({
  path: relative(REPO, path).split("\\").join("/"),
  text: readFileSync(path, "utf8"),
}));

describe("database access boundaries", () => {
  it("scans application code", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("keeps raw SQL out of application code", () => {
    expect(files.filter((f) => RAW_SQL.test(f.text)).map((f) => f.path)).toEqual([]);
  });

  it("uses prismaBase only in the reviewed files", () => {
    const offenders = files
      .filter((f) => PRISMA_BASE.test(f.text) && !PRISMA_BASE_ALLOWED.has(f.path))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});
