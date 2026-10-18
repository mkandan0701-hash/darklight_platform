import { beforeEach, describe, expect, it, vi } from "vitest";

const folderFindMany = vi.fn();
const folderFindFirst = vi.fn();
const folderCreate = vi.fn();
const folderUpdateMany = vi.fn();
const fileFindMany = vi.fn();
const fileFindFirst = vi.fn();
const fileCreate = vi.fn();
const fileUpdateMany = vi.fn();
const fileCount = vi.fn();
const transaction = vi.fn();

vi.mock("@chessplay-clone/db", () => ({
  prisma: {
    pgnFolder: {
      findMany: (...a: unknown[]) => folderFindMany(...a),
      findFirst: (...a: unknown[]) => folderFindFirst(...a),
      create: (...a: unknown[]) => folderCreate(...a),
      updateMany: (...a: unknown[]) => folderUpdateMany(...a),
    },
    pgnFile: {
      findMany: (...a: unknown[]) => fileFindMany(...a),
      findFirst: (...a: unknown[]) => fileFindFirst(...a),
      create: (...a: unknown[]) => fileCreate(...a),
      updateMany: (...a: unknown[]) => fileUpdateMany(...a),
      count: (...a: unknown[]) => fileCount(...a),
    },
    $transaction: (...a: unknown[]) => transaction(...a),
  },
}));

const {
  canManageLibrary,
  createFile,
  createFolder,
  deleteFile,
  deleteFolder,
  DuplicateNameError,
  getFileWithContent,
  getFolder,
  InvalidMoveError,
  listFiles,
  listFolders,
  moveFile,
  moveFolder,
  renameFolder,
} = await import("./pgnRepository");

const staff = { tenantId: "t1", id: "u1", role: "COACH" as const };
const admin = { tenantId: "t1", id: "u1", role: "ACADEMY_ADMIN" as const };
const student = { tenantId: "t1", id: "u2", role: "STUDENT" as const };
const parent = { tenantId: "t1", id: "u3", role: "PARENT" as const };

const all = [
  folderFindMany,
  folderFindFirst,
  folderCreate,
  folderUpdateMany,
  fileFindMany,
  fileFindFirst,
  fileCreate,
  fileUpdateMany,
  fileCount,
  transaction,
];

beforeEach(() => {
  all.forEach((m) => m.mockReset());
  folderFindMany.mockResolvedValue([]);
  folderFindFirst.mockResolvedValue(null);
  folderCreate.mockResolvedValue({ id: "new" });
  folderUpdateMany.mockResolvedValue({ count: 1 });
  fileFindMany.mockResolvedValue([]);
  fileFindFirst.mockResolvedValue(null);
  fileCreate.mockResolvedValue({ id: "newfile" });
  fileUpdateMany.mockResolvedValue({ count: 1 });
  fileCount.mockResolvedValue(0);
  transaction.mockResolvedValue([]);
});

const whereOf = (mock: ReturnType<typeof vi.fn>, call = 0) =>
  (mock.mock.calls[call][0] as { where: Record<string, unknown> }).where;

describe("canManageLibrary", () => {
  it("is staff only", () => {
    expect(canManageLibrary("ACADEMY_ADMIN")).toBe(true);
    expect(canManageLibrary("COACH")).toBe(true);
    expect(canManageLibrary("STUDENT")).toBe(false);
    expect(canManageLibrary("PARENT")).toBe(false);
  });
});

describe("visibility is a query filter, not a UI decision", () => {
  // The bug this layer exists to prevent: a listing that forgets isShared
  // hands a student every coach's private preparation.
  it("limits a student to shared folders", async () => {
    await listFolders(student, null);
    expect(whereOf(folderFindMany)).toMatchObject({ tenantId: "t1", isShared: true });
  });

  it("limits a parent the same way", async () => {
    await listFolders(parent, null);
    expect(whereOf(folderFindMany)).toMatchObject({ isShared: true });
  });

  it("does not restrict staff", async () => {
    await listFolders(staff, null);
    expect(whereOf(folderFindMany).isShared).toBeUndefined();
    await listFolders(admin, null);
    expect(whereOf(folderFindMany, 1).isShared).toBeUndefined();
  });

  it("applies the same rule to a single folder read", async () => {
    await getFolder(student, "f1");
    expect(whereOf(folderFindFirst)).toMatchObject({ id: "f1", isShared: true });
  });

  // A student handed a file id must not be able to read a file out of an
  // unshared folder, so the file read goes through the folder's rule.
  it("gates file contents on the folder's visibility, not the file's", async () => {
    await getFileWithContent(student, "file1");
    const where = whereOf(fileFindFirst) as { folder: Record<string, unknown> };
    expect(where.folder).toMatchObject({ isShared: true, deletedAt: null });
  });

  it("lets staff read any file in their academy", async () => {
    await getFileWithContent(staff, "file1");
    const where = whereOf(fileFindFirst) as { folder: Record<string, unknown> };
    expect(where.folder.isShared).toBeUndefined();
  });
});

describe("tenant scoping and soft deletes", () => {
  it("scopes every read to the academy and skips deleted rows", async () => {
    await listFolders(staff, null);
    await listFiles(staff, "f1");
    for (const where of [whereOf(folderFindMany), whereOf(fileFindMany)]) {
      expect(where).toMatchObject({ tenantId: "t1", deletedAt: null });
    }
  });
});

describe("duplicate names", () => {
  // @@unique([tenantId, parentId, name]) cannot cover root folders, because
  // Postgres treats NULL parents as distinct — so this check is the only thing
  // standing between the user and two folders called "Openings".
  it("refuses a second root folder with the same name", async () => {
    folderFindFirst.mockResolvedValue({ id: "existing" });
    await expect(
      createFolder({ tenantId: "t1", name: "Openings", parentId: null, createdByUserId: "u1" })
    ).rejects.toBeInstanceOf(DuplicateNameError);
    expect(folderCreate).not.toHaveBeenCalled();
  });

  it("compares only against rows that are not deleted", async () => {
    await createFolder({ tenantId: "t1", name: "Openings", parentId: null, createdByUserId: "u1" });
    expect(whereOf(folderFindFirst)).toMatchObject({ name: "Openings", deletedAt: null });
  });

  it("lets a rename keep its own name", async () => {
    folderFindFirst
      .mockResolvedValueOnce({ id: "f1", parentId: null })
      .mockResolvedValueOnce(null);
    await renameFolder("t1", "f1", "Openings");
    expect(whereOf(folderFindFirst, 1)).toMatchObject({ NOT: { id: "f1" } });
    expect(folderUpdateMany).toHaveBeenCalled();
  });

  it("refuses a duplicate filename in the same folder", async () => {
    folderFindFirst.mockResolvedValue({ id: "f1" });
    fileFindFirst.mockResolvedValue({ id: "existing" });
    await expect(
      createFile({
        tenantId: "t1",
        folderId: "f1",
        name: "games.pgn",
        content: "x",
        sizeBytes: 1,
        gameCount: 1,
        uploadedByUserId: "u1",
      })
    ).rejects.toBeInstanceOf(DuplicateNameError);
    expect(fileCreate).not.toHaveBeenCalled();
  });
});

describe("moving a folder", () => {
  // The move that detaches a branch from every root: the breadcrumb walk would
  // then loop, and nothing in the UI could reach the folder again.
  it("refuses a move into itself", async () => {
    folderFindFirst
      .mockResolvedValueOnce({ id: "f1", name: "A" })
      .mockResolvedValueOnce({ id: "f1" });
    folderFindMany.mockResolvedValue([]);
    await expect(moveFolder("t1", "f1", "f1")).rejects.toBeInstanceOf(InvalidMoveError);
    expect(folderUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses a move into its own descendant", async () => {
    folderFindFirst
      .mockResolvedValueOnce({ id: "f1", name: "A" })
      .mockResolvedValueOnce({ id: "grandchild" });
    folderFindMany
      .mockResolvedValueOnce([{ id: "child" }])
      .mockResolvedValueOnce([{ id: "grandchild" }])
      .mockResolvedValue([]);

    await expect(moveFolder("t1", "f1", "grandchild")).rejects.toBeInstanceOf(InvalidMoveError);
    expect(folderUpdateMany).not.toHaveBeenCalled();
  });

  it("allows a move to an unrelated folder", async () => {
    folderFindFirst
      .mockResolvedValueOnce({ id: "f1", name: "A" })
      .mockResolvedValueOnce({ id: "other" })
      .mockResolvedValueOnce(null);
    folderFindMany.mockResolvedValue([]);
    await moveFolder("t1", "f1", "other");
    expect(folderUpdateMany).toHaveBeenCalled();
  });

  it("allows a move to the root", async () => {
    folderFindFirst.mockResolvedValueOnce({ id: "f1", name: "A" }).mockResolvedValueOnce(null);
    await moveFolder("t1", "f1", null);
    expect(folderUpdateMany.mock.calls[0][0].data).toEqual({ parentId: null });
  });
});

describe("moving a file", () => {
  it("refuses a destination holding a file of the same name", async () => {
    fileFindFirst
      .mockResolvedValueOnce({ id: "file1", name: "games.pgn" })
      .mockResolvedValueOnce({ id: "clash" });
    folderFindFirst.mockResolvedValue({ id: "dest" });
    await expect(moveFile("t1", "file1", "dest")).rejects.toBeInstanceOf(DuplicateNameError);
    expect(fileUpdateMany).not.toHaveBeenCalled();
  });
});

describe("deleting", () => {
  // claude.md §4: never delete rows. A mis-click here would otherwise destroy
  // a term of teaching material outright.
  it("soft-deletes a file rather than removing the row", async () => {
    await deleteFile("t1", "file1");
    const data = fileUpdateMany.mock.calls[0][0].data as { deletedAt: Date };
    expect(data.deletedAt).toBeInstanceOf(Date);
  });

  it("stamps the whole subtree in one transaction", async () => {
    folderFindMany.mockResolvedValueOnce([{ id: "child" }]).mockResolvedValue([]);
    await deleteFolder("t1", "root");
    // One transaction, so a crash cannot leave a half-deleted branch where the
    // folder is gone but its files still list.
    expect(transaction).toHaveBeenCalledTimes(1);
    const fileWhere = whereOf(fileUpdateMany) as { folderId: { in: string[] } };
    expect(fileWhere.folderId.in).toContain("root");
    expect(fileWhere.folderId.in).toContain("child");
  });
});

describe("cross-academy protection", () => {
  it("refuses to create a folder under another academy's parent", async () => {
    folderFindFirst.mockResolvedValue(null);
    await expect(
      createFolder({ tenantId: "t1", name: "X", parentId: "foreign", createdByUserId: "u1" })
    ).rejects.toThrow(/not in your academy/i);
    expect(folderCreate).not.toHaveBeenCalled();
  });

  it("refuses to upload into another academy's folder", async () => {
    folderFindFirst.mockResolvedValue(null);
    await expect(
      createFile({
        tenantId: "t1",
        folderId: "foreign",
        name: "a.pgn",
        content: "x",
        sizeBytes: 1,
        gameCount: 1,
        uploadedByUserId: "u1",
      })
    ).rejects.toThrow(/not in your academy/i);
    expect(fileCreate).not.toHaveBeenCalled();
  });
});
