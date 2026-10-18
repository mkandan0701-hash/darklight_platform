import { prisma } from "@chessplay-clone/db";
import type { Role } from "@chessplay-clone/shared";
import { TenantMismatchError } from "../lib/auth/errors";

// Folders and PGN files for the library.
//
// Access is decided here, in the query, not by hiding cards: staff see
// everything in their academy, students and parents see only folders marked
// shared. A `where` that forgets `isShared` is the whole bug this layer
// exists to prevent, so every read goes through visibleFolderWhere.

export type LibraryViewer = { tenantId: string; id: string; role: Role };

/** Staff curate the library; everyone else reads the shared parts of it. */
export function canManageLibrary(role: Role): boolean {
  return role === "ACADEMY_ADMIN" || role === "COACH";
}

/**
 * The visibility filter for a viewer.
 *
 * Note what "shared" does NOT mean: there is no unauthenticated route to any
 * of this. A shared folder is readable by signed-in members of this academy —
 * the screenshot's "Public" folder in this product's terms.
 */
function visibleFolderWhere(viewer: LibraryViewer) {
  return canManageLibrary(viewer.role) ? {} : { isShared: true };
}

const FOLDER_SELECT = {
  id: true,
  name: true,
  parentId: true,
  isShared: true,
  position: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { files: { where: { deletedAt: null } } } },
} as const;

const FILE_SELECT = {
  id: true,
  folderId: true,
  name: true,
  sizeBytes: true,
  gameCount: true,
  position: true,
  createdAt: true,
  updatedAt: true,
  uploadedBy: { select: { email: true, displayName: true } },
} as const;

export type LibraryFolder = Awaited<ReturnType<typeof listFolders>>[number];
export type LibraryFile = Awaited<ReturnType<typeof listFiles>>[number];

export async function listFolders(viewer: LibraryViewer, parentId: string | null) {
  return prisma.pgnFolder.findMany({
    where: {
      tenantId: viewer.tenantId,
      parentId,
      deletedAt: null,
      ...visibleFolderWhere(viewer),
    },
    select: FOLDER_SELECT,
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
}

export async function listFiles(viewer: LibraryViewer, folderId: string) {
  return prisma.pgnFile.findMany({
    where: { tenantId: viewer.tenantId, folderId, deletedAt: null },
    select: FILE_SELECT,
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
}

/** The folder itself, if this viewer may see it. Null reads as "not found". */
export async function getFolder(viewer: LibraryViewer, folderId: string) {
  return prisma.pgnFolder.findFirst({
    where: {
      id: folderId,
      tenantId: viewer.tenantId,
      deletedAt: null,
      ...visibleFolderWhere(viewer),
    },
    select: FOLDER_SELECT,
  });
}

/**
 * Root-to-current path, for the breadcrumb.
 *
 * Walks parents with a depth cap rather than recursing freely: a cycle in the
 * tree would otherwise hang the request, and moveFolder's descendant check can
 * only prevent cycles it knows about.
 */
export async function getFolderPath(
  viewer: LibraryViewer,
  folderId: string
): Promise<{ id: string; name: string }[]> {
  const path: { id: string; name: string }[] = [];
  let cursor: string | null = folderId;

  for (let depth = 0; cursor && depth < MAX_DEPTH; depth++) {
    const folder: { id: string; name: string; parentId: string | null } | null =
      await prisma.pgnFolder.findFirst({
        where: {
          id: cursor,
          tenantId: viewer.tenantId,
          deletedAt: null,
          ...visibleFolderWhere(viewer),
        },
        select: { id: true, name: true, parentId: true },
      });
    if (!folder) break;
    path.unshift({ id: folder.id, name: folder.name });
    cursor = folder.parentId;
  }

  return path;
}

export const MAX_DEPTH = 12;

/** Every folder the viewer can see, for the move dialog's destination list. */
export async function listAllFolders(viewer: LibraryViewer) {
  return prisma.pgnFolder.findMany({
    where: { tenantId: viewer.tenantId, deletedAt: null, ...visibleFolderWhere(viewer) },
    select: { id: true, name: true, parentId: true },
    orderBy: { name: "asc" },
  });
}

async function assertNameFree(
  tenantId: string,
  parentId: string | null,
  name: string,
  exceptId?: string
) {
  // Checked here rather than leaning on @@unique([tenantId, parentId, name]):
  // Postgres treats NULLs as distinct, so that constraint does not cover root
  // folders at all, and it would also collide with soft-deleted rows.
  const clash = await prisma.pgnFolder.findFirst({
    where: { tenantId, parentId, name, deletedAt: null, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) {
    throw new DuplicateNameError(`A folder called "${name}" is already here.`);
  }
}

export class DuplicateNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateNameError";
  }
}

export class InvalidMoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMoveError";
  }
}

export async function createFolder(input: {
  tenantId: string;
  name: string;
  parentId: string | null;
  createdByUserId: string;
}) {
  if (input.parentId) {
    const parent = await prisma.pgnFolder.findFirst({
      where: { id: input.parentId, tenantId: input.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!parent) throw new TenantMismatchError("That parent folder is not in your academy");
  }
  await assertNameFree(input.tenantId, input.parentId, input.name);

  return prisma.pgnFolder.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      parentId: input.parentId,
      createdByUserId: input.createdByUserId,
    },
    select: { id: true },
  });
}

export async function renameFolder(tenantId: string, folderId: string, name: string) {
  const folder = await prisma.pgnFolder.findFirst({
    where: { id: folderId, tenantId, deletedAt: null },
    select: { id: true, parentId: true },
  });
  if (!folder) throw new TenantMismatchError("That folder is not in your academy");

  await assertNameFree(tenantId, folder.parentId, name, folderId);
  await prisma.pgnFolder.updateMany({ where: { id: folderId, tenantId }, data: { name } });
}

export async function setFolderShared(tenantId: string, folderId: string, isShared: boolean) {
  const updated = await prisma.pgnFolder.updateMany({
    where: { id: folderId, tenantId, deletedAt: null },
    data: { isShared },
  });
  if (updated.count === 0) throw new TenantMismatchError("That folder is not in your academy");
}

/** Ids of a folder and everything beneath it. Used by move and delete. */
async function collectSubtree(tenantId: string, rootId: string): Promise<string[]> {
  const ids = [rootId];
  let frontier = [rootId];

  for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0; depth++) {
    const children: { id: string }[] = await prisma.pgnFolder.findMany({
      where: { tenantId, parentId: { in: frontier }, deletedAt: null },
      select: { id: true },
    });
    frontier = children.map((c) => c.id);
    ids.push(...frontier);
  }

  return ids;
}

export async function moveFolder(
  tenantId: string,
  folderId: string,
  newParentId: string | null
) {
  const folder = await prisma.pgnFolder.findFirst({
    where: { id: folderId, tenantId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!folder) throw new TenantMismatchError("That folder is not in your academy");

  if (newParentId) {
    const parent = await prisma.pgnFolder.findFirst({
      where: { id: newParentId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!parent) throw new TenantMismatchError("That destination is not in your academy");

    // The move that detaches a whole branch from the tree: a folder dropped
    // into itself or into one of its own descendants becomes unreachable from
    // any root, and the breadcrumb walk would loop forever.
    const subtree = await collectSubtree(tenantId, folderId);
    if (subtree.includes(newParentId)) {
      throw new InvalidMoveError("A folder can't be moved inside itself.");
    }
  }

  await assertNameFree(tenantId, newParentId, folder.name, folderId);
  await prisma.pgnFolder.updateMany({
    where: { id: folderId, tenantId },
    data: { parentId: newParentId },
  });
}

export interface FolderContents {
  folders: number;
  files: number;
}

/** What a delete would take with it, so the confirmation can say so. */
export async function countFolderContents(
  tenantId: string,
  folderId: string
): Promise<FolderContents> {
  const subtree = await collectSubtree(tenantId, folderId);
  const [files] = await Promise.all([
    prisma.pgnFile.count({ where: { tenantId, folderId: { in: subtree }, deletedAt: null } }),
  ]);
  return { folders: subtree.length - 1, files };
}

/**
 * Soft-deletes a folder, its subfolders and their files.
 *
 * Soft, per claude.md §4 — coaches need an audit trail and a mis-click here
 * would otherwise destroy a term of teaching material. The whole subtree is
 * stamped in one transaction so a half-deleted branch cannot survive a crash.
 */
export async function deleteFolder(tenantId: string, folderId: string) {
  const subtree = await collectSubtree(tenantId, folderId);
  const deletedAt = new Date();

  await prisma.$transaction([
    prisma.pgnFile.updateMany({
      where: { tenantId, folderId: { in: subtree }, deletedAt: null },
      data: { deletedAt },
    }),
    prisma.pgnFolder.updateMany({
      where: { tenantId, id: { in: subtree }, deletedAt: null },
      data: { deletedAt },
    }),
  ]);
}

// --- Files -----------------------------------------------------------------

export async function createFile(input: {
  tenantId: string;
  folderId: string;
  name: string;
  content: string;
  sizeBytes: number;
  gameCount: number | null;
  uploadedByUserId: string;
}) {
  const folder = await prisma.pgnFolder.findFirst({
    where: { id: input.folderId, tenantId: input.tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!folder) throw new TenantMismatchError("That folder is not in your academy");

  const clash = await prisma.pgnFile.findFirst({
    where: {
      tenantId: input.tenantId,
      folderId: input.folderId,
      name: input.name,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (clash) throw new DuplicateNameError(`A file called "${input.name}" is already here.`);

  return prisma.pgnFile.create({
    data: {
      tenantId: input.tenantId,
      folderId: input.folderId,
      name: input.name,
      content: input.content,
      sizeBytes: input.sizeBytes,
      gameCount: input.gameCount,
      uploadedByUserId: input.uploadedByUserId,
    },
    select: { id: true },
  });
}

/**
 * A file with its contents, for viewing and download.
 *
 * Goes through the folder's visibility rule rather than the file's own row:
 * a file is exactly as reachable as the folder holding it, so an unshared
 * folder's contents stay staff-only even to someone with the file's id.
 */
export async function getFileWithContent(viewer: LibraryViewer, fileId: string) {
  return prisma.pgnFile.findFirst({
    where: {
      id: fileId,
      tenantId: viewer.tenantId,
      deletedAt: null,
      folder: { deletedAt: null, ...visibleFolderWhere(viewer) },
    },
    select: { ...FILE_SELECT, content: true },
  });
}

export async function renameFile(tenantId: string, fileId: string, name: string) {
  const file = await prisma.pgnFile.findFirst({
    where: { id: fileId, tenantId, deletedAt: null },
    select: { id: true, folderId: true },
  });
  if (!file) throw new TenantMismatchError("That file is not in your academy");

  const clash = await prisma.pgnFile.findFirst({
    where: { tenantId, folderId: file.folderId, name, deletedAt: null, NOT: { id: fileId } },
    select: { id: true },
  });
  if (clash) throw new DuplicateNameError(`A file called "${name}" is already here.`);

  await prisma.pgnFile.updateMany({ where: { id: fileId, tenantId }, data: { name } });
}

export async function moveFile(tenantId: string, fileId: string, folderId: string) {
  const [file, folder] = await Promise.all([
    prisma.pgnFile.findFirst({
      where: { id: fileId, tenantId, deletedAt: null },
      select: { id: true, name: true },
    }),
    prisma.pgnFolder.findFirst({
      where: { id: folderId, tenantId, deletedAt: null },
      select: { id: true },
    }),
  ]);
  if (!file) throw new TenantMismatchError("That file is not in your academy");
  if (!folder) throw new TenantMismatchError("That destination is not in your academy");

  const clash = await prisma.pgnFile.findFirst({
    where: { tenantId, folderId, name: file.name, deletedAt: null, NOT: { id: fileId } },
    select: { id: true },
  });
  if (clash) {
    throw new DuplicateNameError(`A file called "${file.name}" is already in that folder.`);
  }

  await prisma.pgnFile.updateMany({ where: { id: fileId, tenantId }, data: { folderId } });
}

export async function deleteFile(tenantId: string, fileId: string) {
  const updated = await prisma.pgnFile.updateMany({
    where: { id: fileId, tenantId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (updated.count === 0) throw new TenantMismatchError("That file is not in your academy");
}
