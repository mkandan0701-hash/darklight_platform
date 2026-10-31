import { prisma, Prisma } from "@chessplay-clone/db";
import { createUserWithProfileTx, type NewUserInput } from "./userRepository";

/**
 * Resolve the academy a request is for, from its subdomain.
 *
 * Excludes soft-deleted tenants. `Tenant.deletedAt` existed from the first
 * migration but nothing ever read it, so marking an academy deleted changed
 * nothing — its subdomain kept resolving and its dashboard kept serving. This
 * is the read that makes the column mean something: the dashboard layout
 * resolves the Tenant here, so a null sends the visitor to /signup and the
 * academy is off the air.
 *
 * Note the deliberate asymmetry with signup's availability check
 * (lib/auth/actions.ts), which queries `subdomain` *without* the deletedAt
 * filter. That is correct and must stay: the unique index still holds a
 * deleted tenant's subdomain, so treating it as free here would let signup
 * accept a name that then fails on insert.
 */
export async function getTenantBySubdomain(subdomain: string) {
  return prisma.tenant.findFirst({ where: { subdomain, deletedAt: null } });
}

export async function getTenantById(tenantId: string) {
  return prisma.tenant.findFirst({ where: { id: tenantId, deletedAt: null } });
}

export async function createTenant(input: {
  name: string;
  subdomain: string;
  timezone: string;
}) {
  return prisma.tenant.create({ data: input });
}

/**
 * Signup: the academy and its first admin, in one transaction.
 *
 * Separately, a failure creating the admin left a Tenant row with nobody able
 * to sign in to it — and because `subdomain` is unique, that name was gone
 * for good. Two concurrent signups for the same subdomain are settled by the
 * unique index, not by a read beforehand: the loser's insert fails with
 * P2002 (see isSubdomainTakenError) and its transaction rolls back whole.
 */
export async function createTenantWithAdmin(input: {
  tenant: { name: string; subdomain: string; timezone: string };
  admin: Omit<NewUserInput, "tenantId" | "role" | "timezone">;
}) {
  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({ data: input.tenant });
    const admin = await createUserWithProfileTx(tx, {
      ...input.admin,
      tenantId: tenant.id,
      role: "ACADEMY_ADMIN",
      timezone: input.tenant.timezone,
    });
    return { tenant, admin };
  });
}

/** The unique-index violation a subdomain race (or an already-taken name) raises. */
export function isSubdomainTakenError(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return false;
  const target = err.meta?.target;
  return Array.isArray(target) ? target.includes("subdomain") : String(target ?? "").includes("subdomain");
}

export async function updateTenantBranding(
  tenantId: string,
  data: { logoUrl?: string; brandColor?: string }
) {
  return prisma.tenant.update({ where: { id: tenantId }, data });
}
