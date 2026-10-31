"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "../../../../lib/auth/session";
import { TenantMismatchError } from "../../../../lib/auth/errors";
import { validateName } from "../../../../lib/pgn/library";
import { validatePgn } from "../../../../lib/pgn/parsePgn";
import {
  canManageLibrary,
  countFolderContents,
  createFile,
  createFolder,
  deleteFile,
  deleteFolder,
  DuplicateNameError,
  InvalidMoveError,
  moveFile,
  moveFolder,
  renameFile,
  renameFolder,
  setFolderShared,
} from "../../../../repositories/pgnRepository";

type ActionResult = { ok: true } | { ok: false; error: string };

/** A PGN of annotated master games runs to a few hundred KB; this is generous. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const LIBRARY_PATH = "/dashboard/pgn-library";

/**
 * Every write in this file goes through here first.
 *
 * Authorization is a server concern: hiding the New Folder button from a
 * student does not stop them posting the action, so the role is checked on
 * the way in rather than at render.
 */
async function requireLibraryStaff() {
  const session = await getCurrentSession();
  if (!canManageLibrary(session.role)) {
    return { session: null, denied: { ok: false as const, error: "Only coaches and academy admins can change the library." } };
  }
  return { session, denied: null };
}

/** Turns the repository's typed errors into something a person can act on. */
function describeError(err: unknown, fallback: string): ActionResult {
  if (err instanceof DuplicateNameError || err instanceof InvalidMoveError) {
    return { ok: false, error: err.message };
  }
  if (err instanceof TenantMismatchError) {
    return { ok: false, error: "That item isn't part of your academy." };
  }
  console.error(fallback, err);
  return { ok: false, error: fallback };
}

function revalidateLibrary() {
  revalidatePath(LIBRARY_PATH);
}

// --- Folders ---------------------------------------------------------------

const CreateFolderSchema = z.object({
  name: z.string().min(1, "Give the folder a name."),
  parentId: z.string().optional(),
});

export async function createFolderAction(formData: FormData): Promise<ActionResult> {
  const { session, denied } = await requireLibraryStaff();
  if (denied) return denied;

  const parsed = CreateFolderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const name = validateName(parsed.data.name);
  if (!name.ok) return { ok: false, error: name.error };

  try {
    await createFolder({
      tenantId: session.tenantId,
      name: name.name,
      parentId: parsed.data.parentId || null,
      createdByUserId: session.id,
    });
  } catch (err) {
    return describeError(err, "Couldn't create that folder.");
  }

  revalidateLibrary();
  return { ok: true };
}

const RenameFolderSchema = z.object({
  folderId: z.string().min(1),
  name: z.string().min(1),
});

export async function renameFolderAction(formData: FormData): Promise<ActionResult> {
  const { session, denied } = await requireLibraryStaff();
  if (denied) return denied;

  const parsed = RenameFolderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const name = validateName(parsed.data.name);
  if (!name.ok) return { ok: false, error: name.error };

  try {
    await renameFolder(session.tenantId, parsed.data.folderId, name.name);
  } catch (err) {
    return describeError(err, "Couldn't rename that folder.");
  }

  revalidateLibrary();
  return { ok: true };
}

const MoveFolderSchema = z.object({
  folderId: z.string().min(1),
  parentId: z.string().optional(),
});

export async function moveFolderAction(formData: FormData): Promise<ActionResult> {
  const { session, denied } = await requireLibraryStaff();
  if (denied) return denied;

  const parsed = MoveFolderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  try {
    await moveFolder(session.tenantId, parsed.data.folderId, parsed.data.parentId || null);
  } catch (err) {
    return describeError(err, "Couldn't move that folder.");
  }

  revalidateLibrary();
  return { ok: true };
}

const ShareFolderSchema = z.object({
  folderId: z.string().min(1),
  isShared: z.string().optional(),
});

export async function setFolderSharedAction(formData: FormData): Promise<ActionResult> {
  const { session, denied } = await requireLibraryStaff();
  if (denied) return denied;

  const parsed = ShareFolderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  try {
    await setFolderShared(session.tenantId, parsed.data.folderId, parsed.data.isShared === "on");
  } catch (err) {
    return describeError(err, "Couldn't change who can see that folder.");
  }

  revalidateLibrary();
  return { ok: true };
}

const DeleteFolderSchema = z.object({ folderId: z.string().min(1) });

export async function deleteFolderAction(formData: FormData): Promise<ActionResult> {
  const { session, denied } = await requireLibraryStaff();
  if (denied) return denied;

  const parsed = DeleteFolderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  try {
    await deleteFolder(session.tenantId, parsed.data.folderId);
  } catch (err) {
    return describeError(err, "Couldn't delete that folder.");
  }

  revalidateLibrary();
  return { ok: true };
}

// --- Files -----------------------------------------------------------------

export interface UploadOutcome {
  name: string;
  ok: boolean;
  message: string;
}

/**
 * Uploads one or more .pgn files into a folder.
 *
 * Each file is reported on individually: a batch where the third file is
 * malformed should still store the other four and say which one failed,
 * rather than refusing the whole drop.
 *
 * The stored text is the uploaded text. Parsing happens only to count games
 * and to refuse something that is not chess at all — the content is never
 * regenerated from the parse.
 */
export async function uploadPgnFilesAction(
  formData: FormData
): Promise<{ ok: true; results: UploadOutcome[] } | { ok: false; error: string }> {
  const { session, denied } = await requireLibraryStaff();
  if (denied) return denied;

  const folderId = String(formData.get("folderId") ?? "");
  if (!folderId) return { ok: false, error: "Pick a folder to upload into." };

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return { ok: false, error: "Choose at least one .pgn file." };

  const results: UploadOutcome[] = [];

  for (const file of files) {
    const nameCheck = validateName(file.name);
    if (!nameCheck.ok) {
      results.push({ name: file.name, ok: false, message: nameCheck.error });
      continue;
    }
    if (!nameCheck.name.toLowerCase().endsWith(".pgn")) {
      results.push({ name: file.name, ok: false, message: "Only .pgn files can be uploaded." });
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      results.push({
        name: file.name,
        ok: false,
        message: `Too large — the limit is ${MAX_FILE_BYTES / (1024 * 1024)} MB.`,
      });
      continue;
    }

    let content: string;
    try {
      content = await file.text();
    } catch {
      results.push({ name: file.name, ok: false, message: "Couldn't read that file." });
      continue;
    }

    const validation = validatePgn(content);
    if (!validation.ok) {
      results.push({ name: file.name, ok: false, message: validation.error ?? "Not a valid PGN." });
      continue;
    }

    try {
      await createFile({
        tenantId: session.tenantId,
        folderId,
        name: nameCheck.name,
        content,
        // Measured on the decoded text, so the number matches what downloads.
        sizeBytes: Buffer.byteLength(content, "utf8"),
        gameCount: validation.gameCount,
        uploadedByUserId: session.id,
      });
      const note =
        validation.warnings.length > 0
          ? ` (${validation.warnings.length} note${validation.warnings.length === 1 ? "" : "s"})`
          : "";
      results.push({
        name: nameCheck.name,
        ok: true,
        message: `${validation.gameCount} game${validation.gameCount === 1 ? "" : "s"}${note}`,
      });
    } catch (err) {
      const described = describeError(err, "Couldn't save that file.");
      results.push({
        name: file.name,
        ok: false,
        message: described.ok ? "Couldn't save that file." : described.error,
      });
    }
  }

  revalidateLibrary();
  return { ok: true, results };
}

const RenameFileSchema = z.object({ fileId: z.string().min(1), name: z.string().min(1) });

export async function renameFileAction(formData: FormData): Promise<ActionResult> {
  const { session, denied } = await requireLibraryStaff();
  if (denied) return denied;

  const parsed = RenameFileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const name = validateName(parsed.data.name);
  if (!name.ok) return { ok: false, error: name.error };
  if (!name.name.toLowerCase().endsWith(".pgn")) {
    return { ok: false, error: "Keep the .pgn extension so the file still opens elsewhere." };
  }

  try {
    await renameFile(session.tenantId, parsed.data.fileId, name.name);
  } catch (err) {
    return describeError(err, "Couldn't rename that file.");
  }

  revalidateLibrary();
  return { ok: true };
}

const MoveFileSchema = z.object({ fileId: z.string().min(1), folderId: z.string().min(1) });

export async function moveFileAction(formData: FormData): Promise<ActionResult> {
  const { session, denied } = await requireLibraryStaff();
  if (denied) return denied;

  const parsed = MoveFileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  try {
    await moveFile(session.tenantId, parsed.data.fileId, parsed.data.folderId);
  } catch (err) {
    return describeError(err, "Couldn't move that file.");
  }

  revalidateLibrary();
  return { ok: true };
}

const DeleteFileSchema = z.object({ fileId: z.string().min(1) });

export async function deleteFileAction(formData: FormData): Promise<ActionResult> {
  const { session, denied } = await requireLibraryStaff();
  if (denied) return denied;

  const parsed = DeleteFileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  try {
    await deleteFile(session.tenantId, parsed.data.fileId);
  } catch (err) {
    return describeError(err, "Couldn't delete that file.");
  }

  revalidateLibrary();
  return { ok: true };
}

/**
 * How much a folder delete would take with it.
 *
 * Fetched when the confirmation opens rather than for every card on render:
 * counting a subtree costs a query per level, and doing that for eighteen
 * cards to populate a dialog most of them will never show is eighteen walks
 * nobody asked for.
 */
export async function folderContentsAction(
  folderId: string
): Promise<{ ok: true; folders: number; files: number } | { ok: false; error: string }> {
  const { session, denied } = await requireLibraryStaff();
  if (denied) return denied;

  try {
    const counts = await countFolderContents(session.tenantId, folderId);
    return { ok: true, ...counts };
  } catch (err) {
    console.error("Couldn't count folder contents", err);
    return { ok: false, error: "Couldn't check what's in that folder." };
  }
}
