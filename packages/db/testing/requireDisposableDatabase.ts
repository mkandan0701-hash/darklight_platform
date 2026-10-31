// Vitest setup file for every *.integration.test.ts run, in this package and
// in apps/web.
//
// The integration suites create and delete rows: tenants, classrooms, users,
// roster links. They are written for a throwaway database — the CI workflow's
// postgres service container — and tenantScope.integration.test.ts has said so
// in a comment since it was written ("Never point it at Supabase: this writes
// and deletes rows").
//
// A comment does not stop anything. packages/db/.env sets DATABASE_URL to the
// live Supabase pooler, because the same variable drives prisma migrate and
// prisma studio, so `npm run test:integration` on a developer's laptop pointed
// the destructive suites at production. It happened during an audit of this
// repo. The fixtures are namespaced per run and cleaned up in afterAll, so
// nothing was lost — but "the cleanup worked" is not a safety property, it is
// a lucky one. A crashed run leaves rows behind, and a suite that grows a
// deleteMany with a broader where clause loses real data.
//
// So: refuse to run against anything that isn't obviously disposable, and make
// the override explicit and typed-out rather than a flag someone sets once in
// their shell profile and forgets.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "postgres", "db"]);

const OVERRIDE = "ALLOW_NON_LOCAL_INTEGRATION_DB";

/**
 * Resolve DATABASE_URL the way Prisma will, or the guard checks a different
 * value than the one the tests actually connect with — and a guard that reads
 * the wrong variable is worse than none, because it reports safe.
 *
 * Prisma loads the .env file sitting beside schema.prisma at client init, and
 * a real environment variable takes precedence over it. CI sets the variable;
 * a laptop usually has only the file.
 */
function resolveDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env");
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*DATABASE_URL\s*=\s*(.*)$/);
      if (match) return match[1].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // No .env file — fall through to the "not set" error below.
  }
  return undefined;
}

const url = resolveDatabaseUrl();

if (!url) {
  throw new Error(
    "Integration tests need DATABASE_URL. Point it at a disposable Postgres — " +
      "e.g. postgresql://postgres:postgres@localhost:5432/chessplay_test — not at Supabase."
  );
}

if (process.env[OVERRIDE] !== "1") {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`Integration tests could not parse DATABASE_URL as a URL. Refusing to run.`);
  }

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run integration tests against "${host}".\n\n` +
        `These suites create and DELETE rows. DATABASE_URL must point at a disposable\n` +
        `database — CI uses postgresql://postgres:postgres@localhost:5432/chessplay_test.\n` +
        `packages/db/.env is shared with prisma migrate/studio, so it usually holds your\n` +
        `real database; override it for the test run instead of editing it:\n\n` +
        `  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/chessplay_test \\\n` +
        `    npm run test:integration\n\n` +
        `If "${host}" really is disposable, set ${OVERRIDE}=1 for that command.`
    );
  }
}
