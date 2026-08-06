import { prisma } from "@chessplay-clone/db";
import type { Role } from "@chessplay-clone/shared";
import { TenantMismatchError } from "../lib/auth/errors";

/**
 * Blank in, null out. A cleared profile field and a never-set one mean the
 * same thing — fall back to the email local part — and storing "" for one of
 * them would make `displayName()`'s emptiness check the only thing standing
 * between a user and a nameless row.
 */
function normalizeDisplayName(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Self-serve: a user renaming themselves. Scoped so nobody can rename others. */
export async function updateDisplayName(
  tenantId: string,
  userId: string,
  value: string | null
) {
  return prisma.user.updateMany({
    where: { tenantId, id: userId, deletedAt: null },
    data: { displayName: normalizeDisplayName(value) },
  });
}

export async function createUserWithProfile(input: {
  tenantId: string;
  email: string;
  role: Role;
  timezone: string;
  authProviderId: string;
  /** Optional: an admin inviting someone may not know their name yet. */
  displayName?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        tenantId: input.tenantId,
        email: input.email,
        displayName: normalizeDisplayName(input.displayName),
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

/**
 * The gate for every parent-facing page about one child.
 *
 * Returns the child only if a *live* ParentStudent link joins them to this
 * viewer. Unlinking is a soft delete (see unlinkParentFromStudent), so without
 * `deletedAt: null` a parent whose link an admin revoked would keep reading
 * that child's attendance and homework indefinitely — the tenant guard in
 * packages/db cannot catch this, because both people are in the same academy.
 * The same filter appears in listStudentsForParent above and in
 * membershipWhere's PARENT branch; this is the third place it has to hold.
 *
 * Returns null rather than throwing, so a child who isn't theirs is
 * indistinguishable from one that doesn't exist and the page's notFound()
 * confirms nothing. Same contract as getClassroomForViewer.
 *
 * Takes only what it reads: role plays no part here — safety comes from
 * matching parent.userId — so accepting a full viewer would imply otherwise.
 */
export async function getChildForParent(
  viewer: { tenantId: string; id: string },
  studentProfileId: string
) {
  return prisma.studentProfile.findFirst({
    where: {
      id: studentProfileId,
      tenantId: viewer.tenantId,
      parents: { some: { parent: { userId: viewer.id }, deletedAt: null } },
    },
    include: { user: true },
  });
}
