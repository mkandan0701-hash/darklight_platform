import { describe, expect, it } from "vitest";
import { getAmbientTenantId, openTenantContext, runWithTenant } from "./context";

// Each case starts from its own I/O callback, the way each incoming request
// does, so a slot one opens with enterWith can't reach another.
const isolate = <T>(fn: () => Promise<T>) => new Promise<T>((r) => setImmediate(() => r(fn())));

describe("openTenantContext", () => {
  // A stand-in for getCurrentSession: opens the slot synchronously, resolves
  // the tenant after real async work.
  function lookupSession(tenantId: string) {
    const bind = openTenantContext();
    return new Promise<string>((r) => setTimeout(() => r(tenantId), 5)).then((t) => {
      bind(t);
      return t;
    });
  }

  // The bug: binding from inside the helper, after its await, never reached
  // the caller, so every web request ran tenantScope in presence-only mode.
  it("reaches the caller after it awaits a helper that resolves later", async () => {
    const seen = await isolate(async () => {
      await lookupSession("t1");
      await new Promise((r) => setTimeout(r, 1));
      return getAmbientTenantId();
    });
    expect(seen).toBe("t1");
  });

  it("is visible to every caller in the chain, not only the first", async () => {
    const seen = await isolate(async () => {
      await lookupSession("t1");
      await lookupSession("t1");
      return getAmbientTenantId();
    });
    expect(seen).toBe("t1");
  });

  it("does not leak into an unrelated async chain", async () => {
    const [, other] = await Promise.all([
      isolate(() => lookupSession("t1")),
      isolate(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return getAmbientTenantId();
      }),
    ]);
    expect(other).toBeUndefined();
  });

  it("refuses to repoint a slot at a different tenant", async () => {
    await isolate(async () => {
      openTenantContext()("t1");
      expect(() => openTenantContext()("t2")).toThrow(/rebind/);
      expect(getAmbientTenantId()).toBe("t1");
    });
  });

  it("never writes into the slot of an enclosing runWithTenant's parent", async () => {
    await isolate(async () => {
      openTenantContext()("t1");
      await runWithTenant("t2", async () => {
        expect(getAmbientTenantId()).toBe("t2");
      });
      expect(getAmbientTenantId()).toBe("t1");
    });
  });
});

describe("tenant context", () => {
  it("has no ambient tenant outside runWithTenant", () => {
    expect(getAmbientTenantId()).toBeUndefined();
  });

  it("exposes the tenantId only within runWithTenant's callback", async () => {
    await runWithTenant("t1", async () => {
      expect(getAmbientTenantId()).toBe("t1");
    });
    expect(getAmbientTenantId()).toBeUndefined();
  });

  // The bug this guards: a Prisma query is a lazy thenable that dispatches
  // nothing until something calls .then() on it. Returning one straight out of
  // runWithTenant meant it was awaited after the scope had closed, so
  // tenantScope saw no ambient tenant and fell back to its presence-only
  // check — a cross-tenant filter passed, silently. The failure mode is a
  // security check that stops running without anything going red, so it is
  // tested here on a stand-in thenable rather than only against Postgres.
  function lazyThenable(record: (seen: string | undefined) => void) {
    return {
      then(onFulfilled: (v: string) => unknown) {
        // Runs when the consumer awaits, not when the object is built —
        // exactly Prisma's dispatch timing.
        record(getAmbientTenantId());
        return Promise.resolve(onFulfilled("done"));
      },
    };
  }

  it("keeps the ambient tenant for a lazy thenable returned from the callback", async () => {
    let seenAtDispatch: string | undefined = "unset";
    await runWithTenant("t1", () => lazyThenable((seen) => (seenAtDispatch = seen)));
    expect(seenAtDispatch).toBe("t1");
  });

  it("still returns non-thenable values untouched", () => {
    expect(runWithTenant("t1", () => 42)).toBe(42);
    expect(runWithTenant("t1", () => "plain")).toBe("plain");
    expect(runWithTenant("t1", () => undefined)).toBeUndefined();
  });

  it("isolates concurrent runWithTenant calls", async () => {
    const results: string[] = [];
    await Promise.all([
      runWithTenant("a", async () => {
        await new Promise((r) => setTimeout(r, 10));
        results.push(getAmbientTenantId()!);
      }),
      runWithTenant("b", async () => {
        results.push(getAmbientTenantId()!);
      }),
    ]);
    expect(results.sort()).toEqual(["a", "b"]);
  });
});
