import { prisma } from "@chessplay-clone/db";
import type { Role } from "@chessplay-clone/shared";
import { TenantMismatchError } from "../lib/auth/errors";

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
    where: { tenantId, deletedAt: null },
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
  // Both ids arrive from a form. Unchecked, this is the most damaging of the
  // foreign-id holes: it doesn't expose one field, it grants a parent in one
  // academy standing access to a child in another — their classrooms,
  // homework and attendance — for as long as the link exists. tenantScope
  // passes it because the ParentStudent row carries the caller's own
  // tenantId; only the referenced profiles are foreign.
  const [parent, student] = await Promise.all([
    prisma.parentProfile.findFirst({
      where: { id: input.parentProfileId, tenantId: input.tenantId },
      select: { id: true },
    }),
    prisma.studentProfile.findFirst({
      where: { id: input.studentProfileId, tenantId: input.tenantId },
      select: { id: true },
    }),
  ]);
  if (!parent || !student) {
    throw new TenantMismatchError(
      "Parent or student does not belong to this academy"
    );
  }

  const existing = await prisma.parentStudent.findFirst({
    where: {
      tenantId: input.tenantId,
      parentId: input.parentProfileId,
      studentId: input.studentProfileId,
    },
  });
  // The lookup above deliberately ignores deletedAt. Since unlinking became a
  // soft delete the unique constraint on [parentId, studentId] still covers
  // the retired row, so inserting a fresh one would violate it — re-linking
  // has to revive the row that is already there, which also keeps the history
  // on one row instead of scattering it across several.
  if (existing) {
    if (!existing.deletedAt) return existing;
    return prisma.parentStudent.update({
      where: { id: existing.id, tenantId: input.tenantId },
      data: { deletedAt: null },
    });
  }

  return prisma.parentStudent.create({
    data: {
      tenantId: input.tenantId,
      parentId: input.parentProfileId,
      studentId: input.studentProfileId,
    },
  });
}

// Soft, because this was the one hard DELETE left anywhere in the application
// and claude.md §4 forbids it: who had access to a child's record, and until
// when, is exactly the audit trail parents and coaches need.
//
// Revoking access is the reads' job, not this write's — listStudentsForParent
// and the PARENT branch of membershipWhere both exclude deleted links, so an
// unlinked parent stops seeing the child immediately.
export async function unlinkParentFromStudent(input: { tenantId: string; linkId: string }) {
  await prisma.parentStudent.updateMany({
    where: { tenantId: input.tenantId, id: input.linkId, deletedAt: null },
    data: { deletedAt: new Date() },
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
    where: { tenantId, parentId: parentProfileId, deletedAt: null },
    include: { student: { include: { user: true } } },
  });
}
