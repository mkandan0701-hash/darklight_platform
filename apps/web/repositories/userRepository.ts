import { prisma } from "@chessplay-clone/db";
import type { Role } from "@chessplay-clone/shared";

export async function createUserWithProfile(input: {
  tenantId: string;
  email: string;
  role: Role;
  timezone: string;
  authProviderId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        tenantId: input.tenantId,
        email: input.email,
        role: input.role,
        timezone: input.timezone,
        authProviderId: input.authProviderId,
      },
    });

    if (input.role === "COACH") {
      await tx.coachProfile.create({
        data: { userId: user.id, tenantId: input.tenantId },
      });
    } else if (input.role === "STUDENT") {
      await tx.studentProfile.create({
        data: { userId: user.id, tenantId: input.tenantId },
      });
    } else if (input.role === "PARENT") {
      await tx.parentProfile.create({
        data: { userId: user.id, tenantId: input.tenantId },
      });
    }

    return user;
  });
}

export async function listTenantMembers(tenantId: string) {
  return prisma.user.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
}
