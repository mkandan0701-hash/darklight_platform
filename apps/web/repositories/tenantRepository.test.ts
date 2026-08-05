import { describe, expect, it, vi, beforeEach } from "vitest";

const findFirst = vi.fn();
const findUnique = vi.fn();

vi.mock("@chessplay-clone/db", () => ({
  prisma: {
    tenant: {
      findFirst: (...a: unknown[]) => findFirst(...a),
      findUnique: (...a: unknown[]) => findUnique(...a),
    },
  },
}));

const { getTenantBySubdomain, getTenantById } = await import("./tenantRepository");

beforeEach(() => {
  findFirst.mockReset();
  findUnique.mockReset();
  findFirst.mockResolvedValue(null);
});

// Tenant.deletedAt shipped in the first migration and nothing ever read it, so
// "delete this academy" was a no-op: the subdomain kept resolving and the
// dashboard kept serving every page. These pin the reads that give the column
// its meaning.
describe("getTenantBySubdomain", () => {
  it("excludes soft-deleted academies", async () => {
    await getTenantBySubdomain("demo-academy");
    expect(findFirst).toHaveBeenCalledWith({
      where: { subdomain: "demo-academy", deletedAt: null },
    });
  });

  // findUnique cannot carry a non-unique field in its where, so the filter
  // above is only possible via findFirst. If this ever reverts to findUnique
  // the deletedAt clause goes with it, silently.
  it("does not use findUnique, which cannot carry the filter", async () => {
    await getTenantBySubdomain("demo-academy");
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns null for a deleted academy", async () => {
    findFirst.mockResolvedValue(null);
    expect(await getTenantBySubdomain("was-deleted")).toBeNull();
  });
});

describe("getTenantById", () => {
  it("excludes soft-deleted academies", async () => {
    await getTenantById("tenant_1");
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "tenant_1", deletedAt: null },
    });
  });
});
