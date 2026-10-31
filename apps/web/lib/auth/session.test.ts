import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAmbientTenantId } from "@chessplay-clone/db";

// React's cache() memoizes per request. A plain memo stands in for it: the
// case that broke was the cache *hit*, which skips the lookup's body.
vi.mock("react", () => ({
  cache: <T,>(fn: () => T) => {
    let memo: T | undefined;
    return () => (memo ??= fn());
  },
}));

const getUser = vi.fn();
vi.mock("../supabase/server", () => ({
  createSupabaseServerClient: () => ({ auth: { getUser: () => getUser() } }),
}));

const findUnique = vi.fn();
vi.mock("@chessplay-clone/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chessplay-clone/db")>();
  return { ...actual, prismaBase: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } } };
});

const { getCurrentSession } = await import("./session");

// Each starts from its own I/O callback, as a request does.
const isolate = <T,>(fn: () => Promise<T>) => new Promise<T>((r) => setImmediate(() => r(fn())));

beforeEach(() => {
  getUser.mockResolvedValue({ data: { user: { id: "auth_1", user_metadata: {} } } });
  findUnique.mockImplementation(async () => {
    await new Promise((r) => setTimeout(r, 5));
    return {
      id: "user_1",
      authProviderId: "auth_1",
      tenantId: "tenant_a",
      role: "COACH",
      email: "c@example.com",
      displayName: null,
      timezone: "UTC",
      deletedAt: null,
    };
  });
});

describe("getCurrentSession", () => {
  // Regression: the tenant was bound inside the memoized async lookup, after
  // its awaits, so callers resumed without it and tenantScope never compared
  // a query's tenantId against the session's. A page and its layout both
  // call this; the second gets a cache hit.
  it("binds the session's tenant for the caller, on a cache miss and a cache hit", async () => {
    const [layout, page] = await Promise.all([
      isolate(async () => {
        await getCurrentSession();
        return getAmbientTenantId();
      }),
      isolate(async () => {
        await getCurrentSession();
        await new Promise((r) => setTimeout(r, 1));
        return getAmbientTenantId();
      }),
    ]);

    expect(layout).toBe("tenant_a");
    expect(page).toBe("tenant_a");
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
});
