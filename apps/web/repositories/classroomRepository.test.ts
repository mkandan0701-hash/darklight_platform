import { describe, expect, it, vi, beforeEach } from "vitest";

const findMany = vi.fn();
const findFirst = vi.fn();
const coachProfileFindFirst = vi.fn();
const studentProfileFindFirst = vi.fn();
const classroomCoachCreate = vi.fn();
const classroomStudentCreate = vi.fn();

vi.mock("@chessplay-clone/db", () => ({
  prisma: {
    classroom: {
      findMany: (...a: unknown[]) => findMany(...a),
      findFirst: (...a: unknown[]) => findFirst(...a),
    },
    coachProfile: { findFirst: (...a: unknown[]) => coachProfileFindFirst(...a) },
    studentProfile: { findFirst: (...a: unknown[]) => studentProfileFindFirst(...a) },
    classroomCoach: { create: (...a: unknown[]) => classroomCoachCreate(...a) },
    classroomStudent: { create: (...a: unknown[]) => classroomStudentCreate(...a) },
  },
}));

const {
  listClassroomsForViewer,
  getClassroomForViewer,
  assignCoach,
  enrollStudent,
} = await import("./classroomRepository");

const viewer = (role: string) => ({ tenantId: "tenant_1", id: "user_1", role: role as never });

function whereOf(mock: typeof findMany) {
  const [args] = mock.mock.calls[0] as [{ where: Record<string, any> }];
  return args.where;
}

beforeEach(() => {
  [
    findMany,
    findFirst,
    coachProfileFindFirst,
    studentProfileFindFirst,
    classroomCoachCreate,
    classroomStudentCreate,
  ].forEach((m) => m.mockReset());
  findMany.mockResolvedValue([]);
  findFirst.mockResolvedValue(null);
  coachProfileFindFirst.mockResolvedValue(null);
  studentProfileFindFirst.mockResolvedValue(null);
});

// The bug this file exists for: listClassrooms was tenant-scoped but not
// membership-scoped, so a STUDENT or PARENT signed into their own academy saw
// every classroom in it and every roster email on the detail page. Tenant
// isolation was never breached, which is exactly why nothing caught it.
describe("listClassroomsForViewer", () => {
  it("always scopes by tenant and excludes soft-deleted rows", async () => {
    for (const role of ["ACADEMY_ADMIN", "COACH", "STUDENT", "PARENT"]) {
      findMany.mockClear();
      await listClassroomsForViewer(viewer(role));
      expect(whereOf(findMany), role).toMatchObject({
        tenantId: "tenant_1",
        deletedAt: null,
      });
    }
  });

  it("gives an ACADEMY_ADMIN the whole academy", async () => {
    await listClassroomsForViewer(viewer("ACADEMY_ADMIN"));
    const where = whereOf(findMany);
    expect(where.coaches).toBeUndefined();
    expect(where.students).toBeUndefined();
  });

  it("limits a COACH to rooms they are assigned to", async () => {
    await listClassroomsForViewer(viewer("COACH"));
    expect(whereOf(findMany).coaches).toEqual({
      some: { coach: { userId: "user_1" } },
    });
  });

  it("limits a STUDENT to rooms they are enrolled in", async () => {
    await listClassroomsForViewer(viewer("STUDENT"));
    expect(whereOf(findMany).students).toEqual({
      some: { student: { userId: "user_1" } },
    });
  });

  // A parent has no enrolment of their own — their reach is exactly the union
  // of their children's, via ParentStudent.
  it("limits a PARENT to rooms their own children are enrolled in", async () => {
    await listClassroomsForViewer(viewer("PARENT"));
    expect(whereOf(findMany).students).toEqual({
      some: {
        student: {
          parents: { some: { parent: { userId: "user_1" }, deletedAt: null } },
        },
      },
    });
  });

  // Unlinking a parent is a soft delete, so the link row survives. Without
  // deletedAt on the nested filter the removed parent keeps seeing the child's
  // classrooms — the revocation would be cosmetic.
  it("stops counting a link once it has been soft-deleted", async () => {
    await listClassroomsForViewer(viewer("PARENT"));
    const parents = (whereOf(findMany).students as any).some.student.parents;
    expect(parents.some.deletedAt).toBeNull();
  });

  // The half a post-fetch .filter() in the page could never cover.
  it("never leaves membership to the caller — non-admins always carry a filter", async () => {
    for (const role of ["COACH", "STUDENT", "PARENT"]) {
      findMany.mockClear();
      await listClassroomsForViewer(viewer(role));
      const where = whereOf(findMany);
      expect(where.coaches ?? where.students, `${role} has no membership filter`).toBeDefined();
    }
  });

  it("refuses to guess for an unknown role rather than defaulting to open", async () => {
    await expect(listClassroomsForViewer(viewer("AUDITOR"))).rejects.toThrow(
      /No classroom visibility rule/
    );
  });
});

describe("getClassroomForViewer", () => {
  it("applies the same membership filter as the list", async () => {
    await getClassroomForViewer(viewer("PARENT"), "class_1");
    expect(whereOf(findFirst)).toMatchObject({
      id: "class_1",
      tenantId: "tenant_1",
      deletedAt: null,
      students: {
        some: {
          student: {
            parents: { some: { parent: { userId: "user_1" }, deletedAt: null } },
          },
        },
      },
    });
  });

  // Null, not a thrown error: a guessed id must be indistinguishable from a
  // nonexistent one, so the page's notFound() confirms nothing.
  it("returns null for a classroom the viewer is not in", async () => {
    findFirst.mockResolvedValue(null);
    expect(await getClassroomForViewer(viewer("STUDENT"), "someone_elses_room")).toBeNull();
  });
});

// The roster writes take *two* ids off a form — the classroom and the profile
// — and neither the tenant-scoping extension nor a foreign key checks whose
// they are. The row being inserted carries the caller's own tenantId, which
// satisfies tenantScope; the referenced rows can belong to another academy
// entirely, putting their coach or student (and their email, via
// CLASSROOM_INCLUDE) onto this academy's roster.
describe("assignCoach", () => {
  it("scopes both lookups to the caller's tenant", async () => {
    findFirst.mockResolvedValue({ id: "c_1" });
    coachProfileFindFirst.mockResolvedValue({ id: "coach_1" });

    await assignCoach("tenant_1", "c_1", "coach_1");

    expect(findFirst.mock.calls[0][0].where).toMatchObject({
      id: "c_1",
      tenantId: "tenant_1",
      deletedAt: null,
    });
    expect(coachProfileFindFirst.mock.calls[0][0].where).toEqual({
      id: "coach_1",
      tenantId: "tenant_1",
    });
  });

  it("refuses a coach from another academy", async () => {
    findFirst.mockResolvedValue({ id: "c_1" });
    coachProfileFindFirst.mockResolvedValue(null);

    await expect(assignCoach("tenant_1", "c_1", "other_tenants_coach")).rejects.toThrow(
      /does not belong to this academy/
    );
    expect(classroomCoachCreate).not.toHaveBeenCalled();
  });

  it("refuses a classroom from another academy", async () => {
    findFirst.mockResolvedValue(null);
    coachProfileFindFirst.mockResolvedValue({ id: "coach_1" });

    await expect(assignCoach("tenant_1", "someone_elses", "coach_1")).rejects.toThrow(
      /does not belong to this academy/
    );
    expect(classroomCoachCreate).not.toHaveBeenCalled();
  });

  it("writes when both belong to the caller", async () => {
    findFirst.mockResolvedValue({ id: "c_1" });
    coachProfileFindFirst.mockResolvedValue({ id: "coach_1" });

    await assignCoach("tenant_1", "c_1", "coach_1");
    expect(classroomCoachCreate).toHaveBeenCalledWith({
      data: { tenantId: "tenant_1", classroomId: "c_1", coachId: "coach_1" },
    });
  });
});

describe("enrollStudent", () => {
  it("refuses a student from another academy", async () => {
    findFirst.mockResolvedValue({ id: "c_1" });
    studentProfileFindFirst.mockResolvedValue(null);

    await expect(
      enrollStudent("tenant_1", "c_1", "other_tenants_student")
    ).rejects.toThrow(/does not belong to this academy/);
    expect(classroomStudentCreate).not.toHaveBeenCalled();
  });

  it("refuses a classroom from another academy", async () => {
    findFirst.mockResolvedValue(null);
    studentProfileFindFirst.mockResolvedValue({ id: "stu_1" });

    await expect(enrollStudent("tenant_1", "someone_elses", "stu_1")).rejects.toThrow(
      /does not belong to this academy/
    );
    expect(classroomStudentCreate).not.toHaveBeenCalled();
  });

  it("writes when both belong to the caller", async () => {
    findFirst.mockResolvedValue({ id: "c_1" });
    studentProfileFindFirst.mockResolvedValue({ id: "stu_1" });

    await enrollStudent("tenant_1", "c_1", "stu_1");
    expect(classroomStudentCreate).toHaveBeenCalledWith({
      data: { tenantId: "tenant_1", classroomId: "c_1", studentId: "stu_1" },
    });
  });
});
