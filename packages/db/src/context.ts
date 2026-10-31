import { AsyncLocalStorage } from "node:async_hooks";

// Ambient "which tenant is this unit of work for" context, consumed by
// tenantScopeExtension() in tenantScope.ts to verify (not just check
// presence of) where.tenantId / data.tenantId on every scoped query.
//
// The store is a mutable slot rather than the bare id so a context can be
// opened before the tenant is known (see openTenantContext).
type TenantSlot = { tenantId?: string };
const storage = new AsyncLocalStorage<TenantSlot>();

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
 *
 * Always a fresh slot: a nested runWithTenant never writes into its parent's.
 */
export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return storage.run({ tenantId }, () => {
    const result = fn();
    // Native promises are already dispatched and carry their context; only a
    // lazy thenable needs forcing. Promise.resolve() returns a native promise
    // unchanged, so this costs those callers nothing.
    return (isThenable(result) ? Promise.resolve(result) : result) as T;
  });
}

/**
 * Open a tenant context in the caller's async chain now, and fill in its
 * tenant later. Returns the setter.
 *
 * enterWith() only reaches code that runs after it *in the same frame*. Called
 * after an await inside some helper, it binds the helper's own continuation
 * and nothing else: the caller resumes from its await in the context it had
 * before, with no tenant. That is how getCurrentSession() used to do it, and
 * so every page and server action ran tenantScope in presence-only mode —
 * a filter naming the wrong tenant passed. Opening the slot synchronously,
 * before the caller's await, puts it in the caller's chain; resolving the
 * session afterwards writes into that same slot.
 *
 * Only call where the current execution belongs exclusively to one request
 * (see apps/web/lib/auth/session.ts). Reuses an existing slot, and refuses to
 * repoint one that already holds a different tenant.
 */
export function openTenantContext(): (tenantId: string) => void {
  let slot = storage.getStore();
  if (!slot) {
    slot = {};
    storage.enterWith(slot);
  }
  const bound = slot;
  return (tenantId: string) => {
    if (bound.tenantId !== undefined && bound.tenantId !== tenantId) {
      throw new Error(
        `Refusing to rebind the ambient tenant from "${bound.tenantId}" to "${tenantId}".`
      );
    }
    bound.tenantId = tenantId;
  };
}

/**
 * Bind `tenantId` for the remainder of the *current* frame and what it awaits.
 * Synchronous use only (a script's top level, say): from inside an async
 * helper this cannot reach the helper's caller — use openTenantContext.
 */
export function enterTenantContext(tenantId: string): void {
  openTenantContext()(tenantId);
}

export function getAmbientTenantId(): string | undefined {
  return storage.getStore()?.tenantId;
}
