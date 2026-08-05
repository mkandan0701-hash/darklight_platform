import { describe, expect, it, vi, beforeEach } from "vitest";

const findFirst = vi.fn();
const findMany = vi.fn();
const create = vi.fn();
const update = vi.fn();
const updateMany = vi.fn();
const deleteMany = vi.fn();

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
  },
}));

const {
  linkParentToStudent,
  unlinkParentFromStudent,
  listStudentsForParent,
  listParentStudentLinks,
} = await import("./userRepository");

const LINK = { tenantId: "tenant_1", parentProfileId: "parent_1", studentProfileId: "student_1" };

beforeEach(() => {
  [findFirst, findMany, create, update, updateMany, deleteMany].forEach((m) => m.mockReset());
  findFirst.mockResolvedValue(null);
  findMany.mockResolvedValue([]);
  create.mockResolvedValue({ id: "ps_1" });
  update.mockResolvedValue({ id: "ps_1", deletedAt: null });
});

// unlinkParentFromStudent was the one hard DELETE left in the application.
// claude.md §4 forbids deleting user-facing rows: who could see a child's
// record, and until when, is an audit trail parents and coaches need.
describe("unlinkParentFromStudent", () => {
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
