import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentSession = vi.fn();
const createFolder = vi.fn();
const renameFolder = vi.fn();
const moveFolder = vi.fn();
const deleteFolder = vi.fn();
const setFolderShared = vi.fn();
const createFile = vi.fn();
const renameFile = vi.fn();
const moveFile = vi.fn();
const deleteFile = vi.fn();
const countFolderContents = vi.fn();

class DuplicateNameError extends Error {}
class InvalidMoveError extends Error {}

vi.mock("../../../../lib/auth/session", () => ({
  getCurrentSession: () => getCurrentSession(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../../../repositories/pgnRepository", () => ({
  canManageLibrary: (role: string) => role === "ACADEMY_ADMIN" || role === "COACH",
  createFolder: (...a: unknown[]) => createFolder(...a),
  renameFolder: (...a: unknown[]) => renameFolder(...a),
  moveFolder: (...a: unknown[]) => moveFolder(...a),
  deleteFolder: (...a: unknown[]) => deleteFolder(...a),
  setFolderShared: (...a: unknown[]) => setFolderShared(...a),
  createFile: (...a: unknown[]) => createFile(...a),
  renameFile: (...a: unknown[]) => renameFile(...a),
  moveFile: (...a: unknown[]) => moveFile(...a),
  deleteFile: (...a: unknown[]) => deleteFile(...a),
  countFolderContents: (...a: unknown[]) => countFolderContents(...a),
  DuplicateNameError,
  InvalidMoveError,
}));

const {
  createFolderAction,
  deleteFileAction,
  deleteFolderAction,
  moveFolderAction,
  renameFileAction,
  uploadPgnFilesAction,
} = await import("./actions");

const Q = String.fromCharCode(34);
const VALID_PGN = [
  `[Event ${Q}Club${Q}]`,
  `[White ${Q}A${Q}]`,
  `[Black ${Q}B${Q}]`,
  `[Result ${Q}1-0${Q}]`,
  "",
  "1. e4 e5 2. Nf3 1-0",
].join("\n");

const sessionAs = (role: string) => ({
  id: "user_1",
  tenantId: "tenant_1",
  role,
  email: "c@x.test",
  timezone: "Asia/Kolkata",
});

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function uploadForm(files: { name: string; body: string }[], folderId = "f1") {
  const fd = new FormData();
  fd.set("folderId", folderId);
  for (const f of files) {
    fd.append("files", new File([f.body], f.name, { type: "application/x-chess-pgn" }));
  }
  return fd;
}

const writers = [
  createFolder,
  renameFolder,
  moveFolder,
  deleteFolder,
  setFolderShared,
  createFile,
  renameFile,
  moveFile,
  deleteFile,
];

beforeEach(() => {
  [getCurrentSession, ...writers, countFolderContents].forEach((m) => m.mockReset());
  getCurrentSession.mockResolvedValue(sessionAs("COACH"));
  createFolder.mockResolvedValue({ id: "new" });
  createFile.mockResolvedValue({ id: "newfile" });
});

describe("authorization", () => {
  // Hiding the New Folder button from a student does not stop them posting the
  // action. This is the check that does.
  it("refuses every write for a student or parent", async () => {
    for (const role of ["STUDENT", "PARENT"]) {
      getCurrentSession.mockResolvedValue(sessionAs(role));

      expect(await createFolderAction(form({ name: "X" }))).toMatchObject({ ok: false });
      expect(await renameFileAction(form({ fileId: "f", name: "a.pgn" }))).toMatchObject({
        ok: false,
      });
      expect(await deleteFolderAction(form({ folderId: "f" }))).toMatchObject({ ok: false });
      expect(await deleteFileAction(form({ fileId: "f" }))).toMatchObject({ ok: false });
      expect(await uploadPgnFilesAction(uploadForm([{ name: "a.pgn", body: VALID_PGN }]))).toMatchObject(
        { ok: false }
      );
    }
    for (const writer of writers) expect(writer).not.toHaveBeenCalled();
  });

  it("allows a coach and an admin", async () => {
    for (const role of ["COACH", "ACADEMY_ADMIN"]) {
      getCurrentSession.mockResolvedValue(sessionAs(role));
      expect(await createFolderAction(form({ name: "Openings" }))).toEqual({ ok: true });
    }
    expect(createFolder).toHaveBeenCalledTimes(2);
  });
});

describe("createFolderAction", () => {
  it("trims the name and scopes it to the signed-in academy", async () => {
    await createFolderAction(form({ name: "  Openings  " }));
    expect(createFolder).toHaveBeenCalledWith({
      tenantId: "tenant_1",
      name: "Openings",
      parentId: null,
      createdByUserId: "user_1",
    });
  });

  it("rejects an empty name before touching the database", async () => {
    expect(await createFolderAction(form({ name: "   " }))).toMatchObject({ ok: false });
    expect(createFolder).not.toHaveBeenCalled();
  });

  it("rejects a name with a path separator", async () => {
    expect(await createFolderAction(form({ name: "../etc" }))).toMatchObject({ ok: false });
    expect(createFolder).not.toHaveBeenCalled();
  });

  it("surfaces a duplicate name as a message, not a crash", async () => {
    createFolder.mockRejectedValue(new DuplicateNameError('A folder called "Openings" is already here.'));
    expect(await createFolderAction(form({ name: "Openings" }))).toEqual({
      ok: false,
      error: 'A folder called "Openings" is already here.',
    });
  });
});

describe("moveFolderAction", () => {
  it("passes an empty destination through as the root", async () => {
    await moveFolderAction(form({ folderId: "f1", parentId: "" }));
    expect(moveFolder).toHaveBeenCalledWith("tenant_1", "f1", null);
  });

  it("reports an invalid move in the words the repository used", async () => {
    moveFolder.mockRejectedValue(new InvalidMoveError("A folder can't be moved inside itself."));
    expect(await moveFolderAction(form({ folderId: "f1", parentId: "f1" }))).toEqual({
      ok: false,
      error: "A folder can't be moved inside itself.",
    });
  });
});

describe("renameFileAction", () => {
  // Stripping .pgn would leave a file that downloads and then will not open in
  // any chess program.
  it("insists on keeping the .pgn extension", async () => {
    expect(await renameFileAction(form({ fileId: "f1", name: "games" }))).toMatchObject({
      ok: false,
    });
    expect(renameFile).not.toHaveBeenCalled();

    expect(await renameFileAction(form({ fileId: "f1", name: "games.pgn" }))).toEqual({ ok: true });
  });
});

describe("uploadPgnFilesAction", () => {
  it("stores the uploaded text byte for byte", async () => {
    await uploadPgnFilesAction(uploadForm([{ name: "club.pgn", body: VALID_PGN }]));
    expect(createFile).toHaveBeenCalledTimes(1);
    const arg = createFile.mock.calls[0][0];
    // Never re-serialized from a parse — comments and variations would be gone.
    expect(arg.content).toBe(VALID_PGN);
    expect(arg).toMatchObject({ tenantId: "tenant_1", folderId: "f1", name: "club.pgn", gameCount: 1 });
  });

  it("counts the games it found", async () => {
    const two = `${VALID_PGN}\n\n${VALID_PGN}`;
    await uploadPgnFilesAction(uploadForm([{ name: "two.pgn", body: two }]));
    expect(createFile.mock.calls[0][0].gameCount).toBe(2);
  });

  it("refuses a file that is not a .pgn", async () => {
    const result = await uploadPgnFilesAction(uploadForm([{ name: "notes.txt", body: VALID_PGN }]));
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.results[0]).toMatchObject({ ok: false });
    expect(createFile).not.toHaveBeenCalled();
  });

  it("refuses a .pgn whose contents are not chess", async () => {
    const result = await uploadPgnFilesAction(
      uploadForm([{ name: "letter.pgn", body: "Dear coach,\n\nSee you Saturday.\n" }])
    );
    expect(result.ok && result.results[0].ok).toBe(false);
    expect(result.ok && result.results[0].message).toMatch(/no chess games/i);
    expect(createFile).not.toHaveBeenCalled();
  });

  // A batch where the third file is malformed should still keep the others.
  it("reports each file separately and keeps the good ones", async () => {
    const result = await uploadPgnFilesAction(
      uploadForm([
        { name: "good1.pgn", body: VALID_PGN },
        { name: "bad.pgn", body: "not chess at all" },
        { name: "good2.pgn", body: VALID_PGN },
      ])
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.results.map((r) => [r.name, r.ok])).toEqual([
      ["good1.pgn", true],
      ["bad.pgn", false],
      ["good2.pgn", true],
    ]);
    expect(createFile).toHaveBeenCalledTimes(2);
  });

  it("keeps going when one file fails to save", async () => {
    createFile
      .mockRejectedValueOnce(new DuplicateNameError("A file called \"a.pgn\" is already here."))
      .mockResolvedValueOnce({ id: "ok" });
    const result = await uploadPgnFilesAction(
      uploadForm([
        { name: "a.pgn", body: VALID_PGN },
        { name: "b.pgn", body: VALID_PGN },
      ])
    );
    expect(result.ok && result.results[0].ok).toBe(false);
    expect(result.ok && result.results[1].ok).toBe(true);
  });

  it("asks for a folder before anything else", async () => {
    const fd = new FormData();
    fd.append("files", new File([VALID_PGN], "a.pgn"));
    expect(await uploadPgnFilesAction(fd)).toMatchObject({ ok: false });
    expect(createFile).not.toHaveBeenCalled();
  });

  it("asks for at least one file", async () => {
    expect(await uploadPgnFilesAction(form({ folderId: "f1" }))).toMatchObject({ ok: false });
  });
});
