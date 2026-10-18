import { AsyncLocalStorage } from "node:async_hooks";

// Ambient "which tenant is this unit of work for" context, consumed by
// tenantScopeExtension() in tenantScope.ts to verify (not just check
// presence of) where.tenantId / data.tenantId on every scoped query.
const storage = new AsyncLocalStorage<string>();

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}

/**
 * Run `fn` with `tenantId` bound as the ambient tenant for the duration of
 * `fn`, including everything it `await`s. This is the primary API — use it
 * for any explicitly-scoped unit of work: a single webhook handler
 * invocation, a single Socket.io event handler invocation, a queue job.
 * AsyncLocalStorage.run() creates an isolated child context: concurrent or
 * subsequent calls to runWithTenant with a different tenantId never see
 * each other's store, regardless of interleaving.
 *
 * The Promise.resolve() is load-bearing, not ceremony. A Prisma query is a
 * lazy thenable: `prisma.x.findMany()` builds a PrismaPromise and dispatches
 * nothing until something calls `.then()` on it. So
 *
 *     runWithTenant(t, () => prisma.classroom.findMany({ where }))
 *
 * used to hand that undispatched object straight back out of storage.run(),
 * and whoever awaited it did so *outside* the scope — the extension in
 * tenantScope.ts then read no ambient tenant and silently fell back to the
 * presence-only check, so a filter naming the wrong tenant passed. Nothing
 * threw; the strict check just quietly wasn't running. Resolving the thenable
 * here schedules that .then() inside the scope, where the context still
 * exists.
 *
 * Callers that `await` inside the callback were always fine, which is why
 * every repository-shaped call site was safe and the two webhook handlers
 * that inline the Prisma call were not.
 */
export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return storage.run(tenantId, () => {
    const result = fn();
    // Native promises are already dispatched and carry their context; only a
    // lazy thenable needs forcing. Promise.resolve() returns a native promise
    // unchanged, so this costs those callers nothing.
    return (isThenable(result) ? Promise.resolve(result) : result) as T;
  });
}

/**
 * Bind `tenantId` to the ALS context active for the remainder of the
 * *current* async execution chain, without wrapping a callback. Only call
 * this where the current execution is already guaranteed to belong
 * exclusively to one logical request that will not be reused for another —
 * see apps/web/lib/auth/session.ts for the one sanctioned use and the
 * comment there for why it's safe specifically at that call site.
 */
export function enterTenantContext(tenantId: string): void {
  storage.enterWith(tenantId);
}

export function getAmbientTenantId(): string | undefined {
  return storage.getStore();
}
