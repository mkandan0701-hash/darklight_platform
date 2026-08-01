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

export async function listParentsAndStudents(tenantId: string) {
  const [parents, students] = await Promise.all([
    prisma.parentProfile.findMany({
      where: { tenantId },
      include: { user: true },
      orderBy: { user: { email: "asc" } },
    }),
    prisma.studentProfile.findMany({
      where: { tenantId },
      include: { user: true },
      orderBy: { user: { email: "asc" } },
    }),
  ]);
  return { parents, students };
}

export async function listParentStudentLinks(tenantId: string) {
  return prisma.parentStudent.findMany({
    where: { tenantId },
    include: {
      parent: { include: { user: true } },
      student: { include: { user: true } },
    },
  });
}

// Idempotent: linking an already-linked parent/student pair returns the
// existing link rather than erroring (the unique constraint on
// [parentId, studentId] guards the race between the check and the create).
export async function linkParentToStudent(input: {
  tenantId: string;
  parentProfileId: string;
  studentProfileId: string;
}) {
  const existing = await prisma.parentStudent.findFirst({
    where: {
      tenantId: input.tenantId,
      parentId: input.parentProfileId,
      studentId: input.studentProfileId,
    },
  });
  if (existing) return existing;

  return prisma.parentStudent.create({
    data: {
      tenantId: input.tenantId,
      parentId: input.parentProfileId,
      studentId: input.studentProfileId,
    },
  });
}

export async function unlinkParentFromStudent(input: { tenantId: string; linkId: string }) {
  await prisma.parentStudent.deleteMany({
    where: { tenantId: input.tenantId, id: input.linkId },
  });
}

// getCurrentSession().id is User.id, but StudentProfile-keyed models
// (ClassroomStudent.studentId, PuzzleAttempt.studentId, ...) need the
// StudentProfile's own id — this resolves one from the other.
export async function getStudentProfileByUserId(tenantId: string, userId: string) {
  return prisma.studentProfile.findFirst({ where: { tenantId, userId } });
}

export async function getCoachProfileByUserId(tenantId: string, userId: string) {
  return prisma.coachProfile.findFirst({ where: { tenantId, userId } });
}

export async function getParentProfileByUserId(tenantId: string, userId: string) {
  return prisma.parentProfile.findFirst({ where: { tenantId, userId } });
}

// A parent's own children only. Distinct from listParentStudentLinks, which
// returns every link in the tenant and is safe solely because its one caller
// is admin-gated — do not reuse that one for a parent-facing view.
export async function listStudentsForParent(tenantId: string, parentProfileId: string) {
  return prisma.parentStudent.findMany({
    where: { tenantId, parentId: parentProfileId },
    include: { student: { include: { user: true } } },
  });
}
