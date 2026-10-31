#!/usr/bin/env node
// Vercel's build entry point for apps/web. Invoked by the buildCommand in
// vercel.json; not used by local `npm run build`.
//
// Exists as a script rather than a chain of && in vercel.json for one reason:
// the migration step has to be conditional, and a conditional in a JSON string
// is either shell-specific or unreadable.
//
// Order matters. `prisma generate` must run before either package is compiled
// — packages/db re-exports the generated client, so tsc has nothing to resolve
// without it. Vercel's dependency cache can also restore a node_modules whose
// generated client predates a schema change, which is why generate is
// unconditional rather than postinstall-only.

import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";

const step = (label, command, args) => {
  console.log(`\n▸ ${label}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`\n✗ ${label} failed (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
};

step("prisma generate", "npm", ["run", "db:generate"]);

// Only production deploys migrate. Previews and local `vercel build` runs
// point at the same DATABASE_URL unless someone has explicitly given them
// their own, so an ungated `migrate deploy` here means any preview build —
// including one from an abandoned branch — silently migrates production.
//
// `migrate deploy` applies only committed migration files and never generates
// or resets, so re-running it on an up-to-date database is a no-op. Prisma
// takes an advisory lock, so two concurrent production builds queue rather
// than race.
if (process.env.VERCEL_ENV === "production") {
  step("prisma migrate deploy", "npm", ["run", "db:migrate:deploy"]);
} else {
  console.log(
    `\n▸ skipping migrations (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}, not "production")`
  );
}

// apps/web imports both packages as workspace deps and next.config.js
// transpiles them, but their tsc builds still have to run first: the published
// entry points are dist/, and a stale or missing dist is a build-time module
// resolution failure, not a type error.
step("build @chessplay-clone/db", "npm", ["run", "build", "-w", "packages/db"]);
step("build @chessplay-clone/shared", "npm", ["run", "build", "-w", "packages/shared"]);
// Copy the Prisma query engine to one of the fixed paths Prisma probes at
// runtime. The generated client is inlined into webpack chunks (via
// transpilePackages), so it can no longer find packages/db/generated/client
// relative to itself. next.config.js's outputFileTracingIncludes ships this
// folder with every serverless function.
console.log("\n▸ copy Prisma engine into apps/web/generated/client");
const engineSrc = "packages/db/generated/client";
const engineDest = "apps/web/generated/client";
mkdirSync(engineDest, { recursive: true });
const engineFiles = readdirSync(engineSrc).filter(
  (f) => f.endsWith(".node") || f === "schema.prisma"
);
if (!engineFiles.some((f) => f.endsWith(".node"))) {
  console.error(`\n✗ no Prisma query engine found in ${engineSrc}`);
  process.exit(1);
}
for (const f of engineFiles) copyFileSync(`${engineSrc}/${f}`, `${engineDest}/${f}`);
console.log(`  copied ${engineFiles.join(", ")}`);

step("build @chessplay-clone/web", "npm", ["run", "build", "-w", "apps/web"]);

console.log("\n✓ build complete");
