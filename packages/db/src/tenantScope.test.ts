import { describe, expect, it, vi } from "vitest";
import { runWithTenant } from "./context";
import { tenantScopeExtension } from "./tenantScope";

const TENANT_A = "tenant_a";
const TENANT_B = "tenant_b";

function handler() {
  return tenantScopeExtension().query.$allModels.$allOperations as (p: any) => Promise<any>;
}
function fakeQuery() {
  return vi.fn(async (args: any) => ({ ok: true, args }));
}

describe("tenantScope: no ambient context (presence-only fallback)", () => {
  it("throws when where.tenantId is missing", async () => {
    const query = fakeQuery();
    await expect(
      handler()({ model: "Classroom", operation: "findMany", args: { where: {} }, query })
    ).rejects.toThrow(/tenantId filter/);
    expect(query).not.toHaveBeenCalled();
  });

  it("allows any tenantId value when merely present", async () => {
    const query = fakeQuery();
    await expect(
      handler()({
        model: "Classroom",
        operation: "findMany",
        args: { where: { tenantId: "anything" } },
        query,
      })
    ).resolves.toBeDefined();
  });
});

describe("tenantScope: ambient context set (value-match enforcement)", () => {
  it("allows a matching where.tenantId", async () => {
    const query = fakeQuery();
    await runWithTenant(TENANT_A, () =>
      expect(
        handler()({
          model: "Classroom",
          operation: "findMany",
          args: { where: { tenantId: TENANT_A } },
          query,
        })
      ).resolves.toBeDefined()
    );
  });

  it("rejects a mismatched where.tenantId", async () => {
    const query = fakeQuery();
    await runWithTenant(TENANT_A, () =>
      expect(
        handler()({
          model: "Classroom",
          operation: "findMany",
          args: { where: { tenantId: TENANT_B } },
          query,
        })
      ).rejects.toThrow(/must equal the ambient tenant/)
    );
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects a foreign tenantId nested inside an OR clause", async () => {
    const query = fakeQuery();
    await runWithTenant(TENANT_A, () =>
      expect(
        handler()({
          model: "Classroom",
          operation: "findMany",
          args: { where: { OR: [{ tenantId: TENANT_A }, { tenantId: TENANT_B }] } },
          query,
        })
      ).rejects.toThrow()
    );
  });
});

describe("tenantScope: create/upsert coverage", () => {
  it("rejects create without data.tenantId (no context)", async () => {
    const query = fakeQuery();
    await expect(
      handler()({ model: "Classroom", operation: "create", args: { data: {} }, query })
    ).rejects.toThrow(/data.tenantId/);
  });

  it("rejects create with mismatched data.tenantId under ambient context", async () => {
    const query = fakeQuery();
    await runWithTenant(TENANT_A, () =>
      expect(
        handler()({
          model: "Classroom",
          operation: "create",
          args: { data: { tenantId: TENANT_B } },
          query,
        })
      ).rejects.toThrow()
    );
  });

  it("allows create with matching data.tenantId", async () => {
    const query = fakeQuery();
    await runWithTenant(TENANT_A, () =>
      expect(
        handler()({
          model: "Classroom",
          operation: "create",
          args: { data: { tenantId: TENANT_A } },
          query,
        })
      ).resolves.toBeDefined()
    );
  });

  it("checks every item in createMany", async () => {
    const query = fakeQuery();
    await runWithTenant(TENANT_A, () =>
      expect(
        handler()({
          model: "Classroom",
          operation: "createMany",
          args: { data: [{ tenantId: TENANT_A }, { tenantId: TENANT_B }] },
          query,
        })
      ).rejects.toThrow()
    );
  });

  it("checks every item in createManyAndReturn too", async () => {
    const query = fakeQuery();
    await runWithTenant(TENANT_A, () =>
      expect(
        handler()({
          model: "LiveSession",
          operation: "createManyAndReturn",
          args: { data: [{ tenantId: TENANT_A }, { tenantId: TENANT_B }] },
          query,
        })
      ).rejects.toThrow()
    );
    await expect(
      handler()({ model: "LiveSession", operation: "createManyAndReturn", args: { data: [{}] }, query })
    ).rejects.toThrow(/tenantId set on every item/);
    expect(query).not.toHaveBeenCalled();
  });

  it("checks both upsert's where and create branches", async () => {
    const query = fakeQuery();
    await runWithTenant(TENANT_A, async () => {
      await expect(
        handler()({
          model: "Classroom",
          operation: "upsert",
          args: {
            where: { id: "c1", tenantId: TENANT_A },
            create: { tenantId: TENANT_A },
            update: {},
          },
          query,
        })
      ).resolves.toBeDefined();

      await expect(
        handler()({
          model: "Classroom",
          operation: "upsert",
          args: {
            where: { id: "c1", tenantId: TENANT_A },
            create: { tenantId: TENANT_B },
            update: {},
          },
          query,
        })
      ).rejects.toThrow();
    });
  });
});

describe("tenantScope: exempt models", () => {
  it("never checks Tenant", async () => {
    const query = fakeQuery();
    await expect(
      handler()({ model: "Tenant", operation: "findMany", args: { where: {} }, query })
    ).resolves.toBeDefined();
  });

  it("never checks Puzzle", async () => {
    const query = fakeQuery();
    await expect(
      handler()({ model: "Puzzle", operation: "create", args: { data: {} }, query })
    ).resolves.toBeDefined();
  });
});
