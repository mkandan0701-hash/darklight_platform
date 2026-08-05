import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, prismaBase } from "./index";
import { runWithTenant } from "./context";

/**
 * The tenant-scoping extension against real Postgres.
 *
 * tenantScope.test.ts already covers the decision logic, but it calls the
 * extension's hook with hand-built arguments. That can prove the rules are
 * right and still miss the thing that actually matters in production: whether
 * the extension is attached to the client the application imports, and whether
 * Postgres agrees about what the resulting queries return. This file is the
 * only place both are true at once.
 *
 * Needs DATABASE_URL pointing at a disposable database — the CI workflow's
 * postgres service. Never point it at Supabase: this writes and deletes rows.
 */

// Namespaced per run so a crashed run's leftovers can't collide with the next.
const RUN = randomUUID().slice(0, 8);
const tenantAId = `it-a-${RUN}`;
const tenantBId = `it-b-${RUN}`;

beforeAll(async () => {
  // Tenant is exempt from scoping (it is the thing being scoped *by*), so
  // these two creates need no ambient context.
  await prismaBase.tenant.createMany({
    data: [
      { id: tenantAId, name: `A ${RUN}`, subdomain: `it-a-${RUN}`, timezone: "UTC" },
      { id: tenantBId, name: `B ${RUN}`, subdomain: `it-b-${RUN}`, timezone: "UTC" },
    ],
  });

  await prismaBase.classroom.createMany({
    data: [
      { tenantId: tenantAId, name: "A room" },
      { tenantId: tenantBId, name: "B room" },
    ],
  });
});

afterAll(async () => {
  // prismaBase, not prisma: cleanup deletes across both tenants at once, which
  // is precisely what the extension is built to refuse.
  await prismaBase.classroom.deleteMany({
    where: { tenantId: { in: [tenantAId, tenantBId] } },
  });
  await prismaBase.user.deleteMany({
    where: { tenantId: { in: [tenantAId, tenantBId] } },
  });
  await prismaBase.tenant.deleteMany({
    where: { id: { in: [tenantAId, tenantBId] } },
  });
  await prismaBase.$disconnect();
});

describe("no ambient tenant context", () => {
  it("refuses a read with no tenantId filter", async () => {
    await expect(prisma.classroom.findMany({})).rejects.toThrow(
      /without a tenantId filter/
    );
  });

  it("refuses a write with no tenantId in data", async () => {
    await expect(
      // @ts-expect-error -- omitting tenantId is the point of the test
      prisma.classroom.create({ data: { name: "no tenant" } })
    ).rejects.toThrow(/without data.tenantId/);
  });

  it("allows a read that does filter, and returns only that tenant's rows", async () => {
    const rooms = await prisma.classroom.findMany({ where: { tenantId: tenantAId } });
    expect(rooms).toHaveLength(1);
    expect(rooms[0]?.name).toBe("A room");
  });
});

describe("with an ambient tenant context", () => {
  it("returns only the ambient tenant's rows", async () => {
    const rooms = await runWithTenant(tenantAId, () =>
      prisma.classroom.findMany({ where: { tenantId: tenantAId } })
    );
    expect(rooms.map((r) => r.name)).toEqual(["A room"]);
  });

  // The case a presence-only check would miss: the filter is *there*, it is
  // just someone else's. This is the shape a tenantId sourced from untrusted
  // input takes.
  it("refuses a read filtered to a different tenant", async () => {
    await expect(
      runWithTenant(tenantAId, () =>
        prisma.classroom.findMany({ where: { tenantId: tenantBId } })
      )
    ).rejects.toThrow(/must equal the ambient tenant/);
  });

  it("refuses an OR that smuggles in a second tenant", async () => {
    await expect(
      runWithTenant(tenantAId, () =>
        prisma.classroom.findMany({
          where: { OR: [{ tenantId: tenantAId }, { tenantId: tenantBId }] },
        })
      )
    ).rejects.toThrow(/must equal the ambient tenant/);
  });

  it("refuses a write into a different tenant", async () => {
    await expect(
      runWithTenant(tenantAId, () =>
        prisma.classroom.create({ data: { tenantId: tenantBId, name: "smuggled" } })
      )
    ).rejects.toThrow(/must equal the ambient tenant/);

    const bRooms = await prismaBase.classroom.findMany({ where: { tenantId: tenantBId } });
    expect(bRooms).toHaveLength(1);
  });

  it("refuses an update whose where targets another tenant", async () => {
    await expect(
      runWithTenant(tenantAId, () =>
        prisma.classroom.updateMany({
          where: { tenantId: tenantBId },
          data: { name: "renamed by A" },
        })
      )
    ).rejects.toThrow(/must equal the ambient tenant/);
  });
});

describe("the extension is what enforces this, not the schema", () => {
  // If this ever fails, the guarantees above are coming from somewhere else
  // and the extension could be silently detached without a test noticing.
  it("prismaBase reads across tenants unimpeded", async () => {
    const all = await prismaBase.classroom.findMany({
      where: { tenantId: { in: [tenantAId, tenantBId] } },
    });
    expect(all).toHaveLength(2);
  });
});

describe("tenant isolation at the schema level", () => {
  // Multi-tenancy means the same person's email can exist in two academies —
  // User is unique on [tenantId, email], not on email alone. A plain unique
  // index here would break the second academy to sign up a shared address.
  it("allows the same email in two different tenants", async () => {
    const email = `shared-${RUN}@example.test`;

    await prismaBase.user.create({
      data: {
        tenantId: tenantAId,
        email,
        role: "STUDENT",
        timezone: "UTC",
        authProviderId: `auth-a-${RUN}`,
      },
    });

    await expect(
      prismaBase.user.create({
        data: {
          tenantId: tenantBId,
          email,
          role: "STUDENT",
          timezone: "UTC",
          authProviderId: `auth-b-${RUN}`,
        },
      })
    ).resolves.toMatchObject({ email });
  });
});
