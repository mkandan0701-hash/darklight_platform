import { prisma } from "@chessplay-clone/db";

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

export async function updateTenantBranding(
  tenantId: string,
  data: { logoUrl?: string; brandColor?: string }
) {
  return prisma.tenant.update({ where: { id: tenantId }, data });
}
