import { describe, expect, it, vi, beforeEach } from "vitest";

const findFirst = vi.fn();
const findMany = vi.fn();
const create = vi.fn();
const update = vi.fn();
const updateMany = vi.fn();
const deleteMany = vi.fn();

const parentProfileFindFirst = vi.fn();
const studentProfileFindFirst = vi.fn();
const userUpdateMany = vi.fn();

vi.mock("@chessplay-clone/db", () => ({
  prisma: {
    parentStudent: {
      findFirst: (...a: unknown[]) => findFirst(...a),
      findMany: (...a: unknown[]) => findMany(...a),
      create: (...a: unknown[]) => create(...a),
      update: (...a: unknown[]) => update(...a),
      updateMany: (...a: unknown[]) => updateMany(...a),
      deleteMany: (...a: unknown[]) => deleteMany(...a),
    },
    parentProfile: { findFirst: (...a: unknown[]) => parentProfileFindFirst(...a) },
    studentProfile: { findFirst: (...a: unknown[]) => studentProfileFindFirst(...a) },
    user: { updateMany: (...a: unknown[]) => userUpdateMany(...a) },
  },
}));

const {
  linkParentToStudent,
  unlinkParentFromStudent,
  listStudentsForParent,
  listParentStudentLinks,
  getChildForParent,
  updateDisplayName,
} = await import("./userRepository");

const LINK = { tenantId: "tenant_1", parentProfileId: "parent_1", studentProfileId: "student_1" };

beforeEach(() => {
  [
    findFirst,
    findMany,
    create,
    update,
    updateMany,
    deleteMany,
    parentProfileFindFirst,
    studentProfileFindFirst,
    userUpdateMany,
  ].forEach((m) => m.mockReset());
  findFirst.mockResolvedValue(null);
  findMany.mockResolvedValue([]);
  create.mockResolvedValue({ id: "ps_1" });
  update.mockResolvedValue({ id: "ps_1", deletedAt: null });
  // Both profiles belong to the caller unless a test says otherwise.
  parentProfileFindFirst.mockResolvedValue({ id: "parent_1" });
  studentProfileFindFirst.mockResolvedValue({ id: "student_1" });
});

// unlinkParentFromStudent was the one hard DELETE left in the application.
// claude.md §4 forbids deleting user-facing rows: who could see a child's
// record, and until when, is an audit trail parents and coaches need.
describe("unlinkParentFromStudent", () => {
  beforeEach(() => updateMany.mockResolvedValue({ count: 1 }));

  it("soft-deletes rather than deleting the row", async () => {
    await unlinkParentFromStudent({ tenantId: "tenant_1", linkId: "ps_1" });
    expect(deleteMany).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant_1", id: "ps_1", deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
  });

  // Re-unlinking must not move the timestamp: the audit trail wants when
  // access was first revoked, not when someone last clicked the button.
  it("only touches links that are still live", async () => {
    await unlinkParentFromStudent({ tenantId: "tenant_1", linkId: "ps_1" });
    const [args] = updateMany.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(args.where.deletedAt).toBeNull();
  });

  // Regression: an id from another academy matched nothing and the action
  // still reported success. The caller now learns nothing was removed.
  it("reports whether a link was actually removed", async () => {
    await expect(unlinkParentFromStudent({ tenantId: "tenant_1", linkId: "ps_1" })).resolves.toBe(true);
    updateMany.mockResolvedValue({ count: 0 });
    await expect(unlinkParentFromStudent({ tenantId: "tenant_1", linkId: "ps_foreign" })).resolves.toBe(false);
  });
});

describe("linkParentToStudent", () => {
  it("creates a link when none exists", async () => {
    await linkParentToStudent(LINK);
    expect(create).toHaveBeenCalled();
  });

  it("returns the existing link untouched when already linked", async () => {
    findFirst.mockResolvedValue({ id: "ps_1", deletedAt: null });
    expect(await linkParentToStudent(LINK)).toMatchObject({ id: "ps_1" });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  // The unique constraint on [parentId, studentId] still covers a soft-deleted
  // row, so inserting a second one would violate it. Re-linking has to revive.
  it("revives a soft-deleted link instead of inserting a duplicate", async () => {
    findFirst.mockResolvedValue({ id: "ps_1", deletedAt: new Date() });
    await linkParentToStudent(LINK);
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: "ps_1", tenantId: "tenant_1" },
      data: { deletedAt: null },
    });
  });

  // If this lookup ever gains `deletedAt: null` the revive path above becomes
  // unreachable and re-linking starts failing on the unique constraint.
  it("looks up existing links without filtering on deletedAt", async () => {
    await linkParentToStudent(LINK);
    const [args] = findFirst.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(args.where).not.toHaveProperty("deletedAt");
  });
});

describe("reads exclude retired links", () => {
  it("listStudentsForParent filters soft-deleted links", async () => {
    await listStudentsForParent("tenant_1", "parent_1");
    const [args] = findMany.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(args.where).toMatchObject({
      tenantId: "tenant_1",
      parentId: "parent_1",
      deletedAt: null,
    });
  });

  it("listParentStudentLinks filters soft-deleted links", async () => {
    await listParentStudentLinks("tenant_1");
    const [args] = findMany.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(args.where).toMatchObject({ tenantId: "tenant_1", deletedAt: null });
  });
});

// The most damaging of the foreign-id holes. Unchecked, an admin could link a
// parent in their own academy to a student in a *different* one — and unlike
// the roster writes, which expose an email, this grants standing access: the
// PARENT branch of membershipWhere then hands that parent the other academy's
// child's classrooms, homework and attendance for as long as the link lives.
describe("linkParentToStudent tenant ownership", () => {
  it("checks both profiles against the caller's tenant", async () => {
    await linkParentToStudent(LINK);

    expect(parentProfileFindFirst.mock.calls[0][0].where).toEqual({
      id: "parent_1",
      tenantId: "tenant_1",
    });
    expect(studentProfileFindFirst.mock.calls[0][0].where).toEqual({
      id: "student_1",
      tenantId: "tenant_1",
    });
  });

  it("refuses a student from another academy", async () => {
    studentProfileFindFirst.mockResolvedValue(null);
    await expect(linkParentToStudent(LINK)).rejects.toThrow(
      /does not belong to this academy/
    );
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses a parent from another academy", async () => {
    parentProfileFindFirst.mockResolvedValue(null);
    await expect(linkParentToStudent(LINK)).rejects.toThrow(
      /does not belong to this academy/
    );
    expect(create).not.toHaveBeenCalled();
  });

  // The ownership check must run before the revive path too, or a link retired
  // for good reason could be resurrected with foreign ids.
  it("refuses foreign ids even when a soft-deleted link already exists", async () => {
    findFirst.mockResolvedValue({ id: "ps_1", deletedAt: new Date() });
    studentProfileFindFirst.mockResolvedValue(null);
    await expect(linkParentToStudent(LINK)).rejects.toThrow(
      /does not belong to this academy/
    );
    expect(update).not.toHaveBeenCalled();
  });
});

// The gate every parent-facing per-child page sits behind. The tenant guard in
// packages/db cannot help here: a parent and somebody else's child are in the
// same academy, so the leak this would cause is entirely within one tenant.
describe("getChildForParent", () => {
  const viewer = { tenantId: "tenant_1", id: "user_parent_1" };

  function whereOf() {
    const [args] = studentProfileFindFirst.mock.calls[0] as [{ where: Record<string, any> }];
    return args.where;
  }

  it("scopes by the requested student and the viewer's tenant", async () => {
    await getChildForParent(viewer, "student_1");
    expect(whereOf()).toMatchObject({ id: "student_1", tenantId: "tenant_1" });
  });

  // Regression guard. Unlinking is a soft delete, so a link filter without
  // `deletedAt: null` keeps a revoked parent reading their ex-child's
  // attendance and homework forever. listStudentsForParent and
  // membershipWhere's PARENT branch both carry it; this is the third place it
  // has to hold, and the one an earlier draft of this feature got wrong.
  it("requires the parent link to be live, not soft-deleted", async () => {
    await getChildForParent(viewer, "student_1");
    expect(whereOf().parents).toEqual({
      some: { parent: { userId: "user_parent_1" }, deletedAt: null },
    });
  });

  // The viewer carries a User.id; ParentStudent joins through ParentProfile.
  // Matching on parent.userId is what keeps those two from being confused.
  it("matches the parent by their user id, not a ParentProfile id", async () => {
    await getChildForParent(viewer, "student_1");
    expect(whereOf().parents.some.parent).toEqual({ userId: "user_parent_1" });
  });

  it("returns null rather than throwing for a child that isn't theirs", async () => {
    studentProfileFindFirst.mockResolvedValue(null);
    await expect(getChildForParent(viewer, "someone_elses_child")).resolves.toBeNull();
  });

  it("includes the user row the page names the child from", async () => {
    await getChildForParent(viewer, "student_1");
    const [args] = studentProfileFindFirst.mock.calls[0] as [{ include: Record<string, any> }];
    expect(args.include).toEqual({ user: true });
  });
});

// Self-serve renaming. The id comes from the session, never a form field, so
// the interesting property is that the write can't reach anyone else's row.
describe("updateDisplayName", () => {
  function whereOf() {
    const [args] = userUpdateMany.mock.calls[0] as [{ where: Record<string, any> }];
    return args.where;
  }
  function dataOf() {
    const [args] = userUpdateMany.mock.calls[0] as [{ data: Record<string, any> }];
    return args.data;
  }

  it("scopes the write to this tenant, this user, and a live account", async () => {
    await updateDisplayName("tenant_1", "user_1", "Dev Iyer");
    expect(whereOf()).toEqual({ tenantId: "tenant_1", id: "user_1", deletedAt: null });
  });

  it("stores the trimmed name", async () => {
    await updateDisplayName("tenant_1", "user_1", "  Dev Iyer  ");
    expect(dataOf()).toEqual({ displayName: "Dev Iyer" });
  });

  // Blank and never-set have to be the same stored value, or displayName()'s
  // emptiness check becomes the only thing keeping a nameless row off screen.
  it("normalizes a cleared field to null rather than an empty string", async () => {
    for (const cleared of ["", "   ", null]) {
      userUpdateMany.mockClear();
      await updateDisplayName("tenant_1", "user_1", cleared);
      expect(dataOf(), `${JSON.stringify(cleared)} should store null`).toEqual({
        displayName: null,
      });
    }
  });
});
