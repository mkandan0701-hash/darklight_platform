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
