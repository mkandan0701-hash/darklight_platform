import { prisma, type Prisma } from "@chessplay-clone/db";
import type { Role } from "@chessplay-clone/shared";
import { TenantMismatchError } from "../lib/auth/errors";

const CLASSROOM_INCLUDE = {
  coaches: { include: { coach: { include: { user: true } } } },
  students: { include: { student: { include: { user: true } } } },
} satisfies Prisma.ClassroomInclude;

// Only the three session fields the membership filter needs, so callers can
// pass a CurrentSession straight through without this layer depending on it.
export type ClassroomViewer = { tenantId: string; id: string; role: Role };

// Tenant scoping answers "is this the right academy"; it does not answer "is
// this person in this room". Without the second question, a STUDENT or PARENT
// sees every classroom in the academy and every roster email on it — within
// their own tenant, so no tenant-isolation check catches it.
//
// Membership is expressed as a `where` fragment rather than a post-fetch
// `.filter()` so the rows never leave Postgres. A filter in the page is one
// forgotten call site away from being the leak again, and it can't gate the
// single-classroom read at all.
function membershipWhere(viewer: ClassroomViewer): Prisma.ClassroomWhereInput {
  switch (viewer.role) {
    // Runs the academy: every room in it is theirs to see.
    case "ACADEMY_ADMIN":
      return {};
    case "COACH":
      return { coaches: { some: { coach: { userId: viewer.id } } } };
    case "STUDENT":
      return { students: { some: { student: { userId: viewer.id } } } };
    // A parent inherits their children's rooms and nothing else. `deletedAt:
    // null` on the link is what makes unlinking take effect — without it a
    // parent removed from a child keeps seeing that child's classrooms,
    // because unlinking is a soft delete and the row is still there.
    case "PARENT":
      return {
        students: {
          some: {
            student: {
              parents: { some: { parent: { userId: viewer.id }, deletedAt: null } },
            },
          },
        },
      };
    default: {
      // A new Role must decide its own visibility here. Defaulting to "see
      // everything" is how this gap happened the first time.
      const exhaustive: never = viewer.role;
      throw new Error(`No classroom visibility rule for role ${exhaustive}`);
    }
  }
}

/**
 * The complete "which rooms may this viewer see" filter — membership plus the
 * soft-delete exclusion.
 *
 * Exported because everything a classroom owns inherits that answer: live
 * sessions, assignments, attendance. Those repositories nest this under
 * `classroom:` rather than restating the four roles, so the rule has one home
 * and a new role has one place to be considered. It bundles `deletedAt: null`
 * on purpose — a nested caller composing membership alone would happily serve
 * the sessions of a deleted classroom, and that omission is invisible at the
 * call site.
 */
export function visibleClassroomWhere(
  viewer: ClassroomViewer
): Prisma.ClassroomWhereInput {
  return { deletedAt: null, ...membershipWhere(viewer) };
}

export async function createClassroom(
  tenantId: string,
  name: string,
  weekendFirst = true
) {
  return prisma.classroom.create({ data: { tenantId, name, weekendFirst } });
}

// There is deliberately no unscoped listClassrooms(tenantId): an
// ACADEMY_ADMIN viewer already returns every room in the tenant, so a second
// entry point would only be a way to skip the membership filter by accident.
export async function listClassroomsForViewer(viewer: ClassroomViewer) {
  return prisma.classroom.findMany({
    where: { tenantId: viewer.tenantId, ...visibleClassroomWhere(viewer) },
    include: CLASSROOM_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
}

/**
 * The classrooms one specific student is enrolled in.
 *
 * Not expressible as listClassroomsForViewer: for a PARENT that returns the
 * union across every child, so a room it yields can't be attributed to the one
 * whose page is being rendered. Two children in different classes would each
 * appear to be in both.
 *
 * Tenant-scoped but NOT viewer-scoped — the caller must already have
 * established its right to this student (see getChildForParent).
 */
export async function listClassroomsForStudent(tenantId: string, studentProfileId: string) {
  return prisma.classroom.findMany({
    where: {
      tenantId,
      deletedAt: null,
      students: { some: { studentId: studentProfileId } },
    },
    orderBy: { createdAt: "asc" },
  });
}

// Tenant-scoped but NOT membership-scoped: for callers that have already
// established the actor's right to this specific classroom by another route
// (a role gate plus isCoachAssignedToClassroom, or a roster check of their
// own). Anything reachable by a user-supplied id should use
// getClassroomForViewer instead.
export async function getClassroom(tenantId: string, classroomId: string) {
  return prisma.classroom.findFirst({
    where: { id: classroomId, tenantId, deletedAt: null },
    include: CLASSROOM_INCLUDE,
  });
}

// Null for a classroom the viewer isn't in — indistinguishable from one that
// doesn't exist, so pages can call notFound() and leak nothing about which
// classroom ids are real.
export async function getClassroomForViewer(
  viewer: ClassroomViewer,
  classroomId: string
) {
  return prisma.classroom.findFirst({
    where: {
      id: classroomId,
      tenantId: viewer.tenantId,
      ...visibleClassroomWhere(viewer),
    },
    include: CLASSROOM_INCLUDE,
  });
}

/**
 * Both ids come off a form, so both are checked against the caller's tenant
 * before anything is written.
 *
 * Neither the tenant-scoping extension nor the database catches this. The row
 * being inserted carries the *caller's* tenantId, so tenantScope is satisfied;
 * it is the referenced rows that may belong to someone else, and a foreign key
 * only asks whether a row exists, never whose it is. The result would be
 * another academy's coach on this academy's roster — with their email rendered
 * on the classroom page, since CLASSROOM_INCLUDE pulls in coach.user.
 *
 * Throws rather than returning null: claude.md §7 puts typed errors in the
 * repository and their translation at the route boundary, and unlike a read
 * there is no sensible "not found" result to hand back for a write that must
 * not happen.
 */
export async function assignCoach(
  tenantId: string,
  classroomId: string,
  coachProfileId: string
) {
  const [classroom, coach] = await Promise.all([
    prisma.classroom.findFirst({
      where: { id: classroomId, tenantId, deletedAt: null },
      select: { id: true },
    }),
    prisma.coachProfile.findFirst({
      where: { id: coachProfileId, tenantId },
      select: { id: true },
    }),
  ]);
  if (!classroom || !coach) {
    throw new TenantMismatchError(
      "Classroom or coach does not belong to this academy"
    );
  }

  return prisma.classroomCoach.create({
    data: { tenantId, classroomId, coachId: coachProfileId },
  });
}

// createAssignmentAction needs this: unlike existing classroom-write actions
// (all ACADEMY_ADMIN-only today), assigning homework is the first COACH-writable
// action into a specific classroom, so ownership isn't implied by role alone.
export async function isCoachAssignedToClassroom(
  tenantId: string,
  classroomId: string,
  coachProfileId: string
) {
  const link = await prisma.classroomCoach.findFirst({
    where: { tenantId, classroomId, coachId: coachProfileId },
  });
  return link !== null;
}

/** Same guard as assignCoach, for the student side of the roster. */
export async function enrollStudent(
  tenantId: string,
  classroomId: string,
  studentProfileId: string
) {
  const [classroom, student] = await Promise.all([
    prisma.classroom.findFirst({
      where: { id: classroomId, tenantId, deletedAt: null },
      select: { id: true },
    }),
    prisma.studentProfile.findFirst({
      where: { id: studentProfileId, tenantId },
      select: { id: true },
    }),
  ]);
  if (!classroom || !student) {
    throw new TenantMismatchError(
      "Classroom or student does not belong to this academy"
    );
  }

  return prisma.classroomStudent.create({
    data: { tenantId, classroomId, studentId: studentProfileId },
  });
}
