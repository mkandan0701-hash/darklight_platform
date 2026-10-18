import { describe, expect, it } from "vitest";
import { getAmbientTenantId, runWithTenant } from "./context";

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
