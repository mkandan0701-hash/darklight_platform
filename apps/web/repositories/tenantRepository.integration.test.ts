import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prismaBase } from "@chessplay-clone/db";
import { createTenantWithAdmin, isSubdomainTakenError } from "./tenantRepository";

/**
 * Signup's atomicity against real Postgres. The unit tests mock the
 * repository, so only this file can show that a failed admin insert really
 * takes the Tenant row with it, and that the unique index (not the action's
 * pre-check) settles two simultaneous signups for one subdomain.
 *
 * Needs DATABASE_URL pointing at a disposable database (the CI postgres
 * service). Never Supabase — see packages/db/testing/requireDisposableDatabase.ts.
 */

const RUN = randomUUID().slice(0, 8);
const subdomains: string[] = [];

function signup(subdomain: string, authProviderId = `auth-${randomUUID()}`) {
  subdomains.push(subdomain);
  return createTenantWithAdmin({
    tenant: { name: `Signup ${RUN}`, subdomain, timezone: "UTC" },
    admin: { email: `admin-${randomUUID()}@example.com`, authProviderId },
  });
}

afterAll(async () => {
  const tenants = await prismaBase.tenant.findMany({ where: { subdomain: { in: subdomains } } });
  const ids = tenants.map((t) => t.id);
  await prismaBase.user.deleteMany({ where: { tenantId: { in: ids } } });
  await prismaBase.tenant.deleteMany({ where: { id: { in: ids } } });
  await prismaBase.$disconnect();
});

describe("createTenantWithAdmin", () => {
  it("creates the tenant and its admin together", async () => {
    const { tenant, admin } = await signup(`ok-${RUN}`);

    expect(admin.tenantId).toBe(tenant.id);
    expect(admin.role).toBe("ACADEMY_ADMIN");
  });

  it("lets exactly one of two concurrent signups for a subdomain win", async () => {
    const subdomain = `race-${RUN}`;

    const results = await Promise.allSettled([signup(subdomain), signup(subdomain)]);

    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(isSubdomainTakenError(lost[0]!.reason)).toBe(true);
    expect(await prismaBase.tenant.count({ where: { subdomain } })).toBe(1);
  });

  it("leaves no tenant behind when the admin insert fails", async () => {
    const reusedAuthId = `auth-dup-${RUN}`;
    await signup(`first-${RUN}`, reusedAuthId);
    const subdomain = `orphan-${RUN}`;

    // authProviderId is unique, so the second admin insert fails after the
    // tenant insert has already succeeded inside the transaction.
    await expect(signup(subdomain, reusedAuthId)).rejects.toThrow();

    expect(await prismaBase.tenant.count({ where: { subdomain } })).toBe(0);
  });
});
