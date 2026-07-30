import { PrismaClient } from "../generated/client";
import { tenantScopeExtension } from "./tenantScope";

export { runWithTenant, enterTenantContext, getAmbientTenantId } from "./context";

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
export const prisma = prismaBase.$extends(tenantScopeExtension());

export * from "../generated/client";
