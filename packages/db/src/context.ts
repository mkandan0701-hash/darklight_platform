import { AsyncLocalStorage } from "node:async_hooks";

// Ambient "which tenant is this unit of work for" context, consumed by
// tenantScopeExtension() in tenantScope.ts to verify (not just check
// presence of) where.tenantId / data.tenantId on every scoped query.
const storage = new AsyncLocalStorage<string>();

/**
 * Run `fn` with `tenantId` bound as the ambient tenant for the duration of
 * `fn`, including everything it `await`s. This is the primary API — use it
 * for any explicitly-scoped unit of work: a single webhook handler
 * invocation, a single Socket.io event handler invocation, a queue job.
 * AsyncLocalStorage.run() creates an isolated child context: concurrent or
 * subsequent calls to runWithTenant with a different tenantId never see
 * each other's store, regardless of interleaving.
 */
export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return storage.run(tenantId, fn);
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
