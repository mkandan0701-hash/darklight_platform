import { PrismaClient, Prisma } from "../generated/client";
import { requireTenantContext, tenantScopeExtension, type RelationMap } from "./tenantScope";

export { runWithTenant, enterTenantContext, openTenantContext, getAmbientTenantId } from "./context";
export { requireTenantContext } from "./tenantScope";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prismaBase =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prismaBase;
}

// Use `prisma` everywhere in application code. `prismaBase` (unextended) should
// only be used for the `Tenant` and `Puzzle` models (intentionally exempt from
// tenant scoping), plus two sanctioned bootstrap exceptions:
//   1. Looking up a `User` by its globally-unique `authProviderId` when
//      resolving the current session (see apps/web/lib/auth/session.ts) —
//      that lookup is what discovers `tenantId` in the first place, so it
//      can't itself require a tenantId filter.
//   2. Looking up an `Invoice` by its globally-unique `(provider, providerRef)`
//      key in the Stripe/Razorpay webhook handlers (apps/api/src/webhooks/) —
//      used to resolve the invoice's *real* tenantId from Postgres before
//      trusting anything from the webhook payload for scoping, then that real
//      tenantId is used both as the scoping filter and as the ambient tenant
//      context (via runWithTenant) for the actual scoped update.
// src/boundaries.test.ts fails the build if prismaBase or raw SQL appears
// anywhere else in application code.
const relations: RelationMap = Object.fromEntries(
  Prisma.dmmf.datamodel.models.map((model) => [
    model.name,
    Object.fromEntries(
      model.fields.filter((f) => f.kind === "object").map((f) => [f.name, f.type])
    ),
  ])
);

export const prisma = prismaBase.$extends(tenantScopeExtension({ relations }));

// The API server and worker switch strict mode on themselves; apps/web opts in
// through the environment until every unauthenticated path is known to stay
// off tenant-scoped models (see .env.example).
requireTenantContext(process.env.TENANT_SCOPE_STRICT === "1");

export * from "../generated/client";
