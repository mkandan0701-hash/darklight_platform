import { prisma } from "@chessplay-clone/db";

export async function getTenantBySubdomain(subdomain: string) {
  return prisma.tenant.findUnique({ where: { subdomain } });
}

export async function getTenantById(tenantId: string) {
  return prisma.tenant.findUnique({ where: { id: tenantId } });
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
