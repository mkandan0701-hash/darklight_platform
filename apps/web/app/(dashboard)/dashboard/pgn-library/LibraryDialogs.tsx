"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Modal, ModalFooter } from "../../../../components/ui/Modal";
import { Button } from "../../../../components/ui/Button";
import { Field, fieldInputClass } from "../../../../components/ui/Field";
import {
  createFolderAction,
  deleteFileAction,
  deleteFolderAction,
  folderContentsAction,
  moveFileAction,
  moveFolderAction,
  renameFileAction,
  renameFolderAction,
  setFolderSharedAction,
  uploadPgnFilesAction,
  type UploadOutcome,
} from "./actions";

type ActionResult = { ok: true } | { ok: false; error: string };

export interface FolderOption {
  id: string;
  name: string;
  parentId: string | null;
}

/**
 * Submit plumbing shared by every dialog here.
 *
 * `pending` drives both the disabled state and the label, which is what stops
 * a double-click creating two folders — the second click lands on a disabled
 * button rather than firing a second action.
 */
function useDialogAction(action: (formData: FormData) => Promise<ActionResult>, onDone: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDone();
    });
  }

  return { error, pending, submit, setError };
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-3 text-sm text-brick">
      {message}
    </p>
  );
}

/** Autofocus that waits for the dialog to actually be open. */
function useAutoFocus(open: boolean) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => {
      ref.current?.focus();
      ref.current?.select();
    }, 30);
    return () => clearTimeout(id);
  }, [open]);
  return ref;
}

// --- Create / rename -------------------------------------------------------

export function CreateFolderDialog({
  open,
  onClose,
  parentId,
}: {
  open: boolean;
  onClose: () => void;
  parentId: string | null;
}) {
  const { error, pending, submit, setError } = useDialogAction(createFolderAction, onClose);
  const inputRef = useAutoFocus(open);
  const nameId = useId();

  return (
    <Modal
      open={open}
      onClose={() => {
        setError(null);
        onClose();
      }}
      title="Create New Folder"
      description={parentId ? "Inside the folder you have open." : "At the top of your library."}
    >
      <form action={submit}>
        {parentId && <input type="hidden" name="parentId" value={parentId} />}
        <Field label="Folder Name">
          <input
            ref={inputRef}
            id={nameId}
            name="name"
            required
            maxLength={120}
            placeholder="Openings"
            className={fieldInputClass}
          />
        </Field>
        <ErrorLine message={error} />
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create Folder"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

export function RenameDialog({
  open,
  onClose,
  kind,
  id,
  currentName,
}: {
  open: boolean;
  onClose: () => void;
  kind: "folder" | "file";
  id: string;
  currentName: string;
}) {
  const action = kind === "folder" ? renameFolderAction : renameFileAction;
  const { error, pending, submit } = useDialogAction(action, onClose);
  const inputRef = useAutoFocus(open);

  return (
    <Modal open={open} onClose={onClose} title={`Rename ${kind}`}>
      <form action={submit}>
        <input type="hidden" name={kind === "folder" ? "folderId" : "fileId"} value={id} />
        <Field
          label={kind === "folder" ? "Folder Name" : "File Name"}
          help={kind === "file" ? "Keep the .pgn extension." : undefined}
        >
          <input
            ref={inputRef}
            name="name"
            required
            maxLength={120}
            defaultValue={currentName}
            className={fieldInputClass}
          />
        </Field>
        <ErrorLine message={error} />
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

// --- Move ------------------------------------------------------------------

/** Ids of a folder and everything under it, so the picker can exclude them. */
function descendantsOf(folderId: string, folders: FolderOption[]): Set<string> {
  const excluded = new Set([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of folders) {
      if (folder.parentId && excluded.has(folder.parentId) && !excluded.has(folder.id)) {
        excluded.add(folder.id);
        grew = true;
      }
    }
  }
  return excluded;
}

export function MoveDialog({
  open,
  onClose,
  kind,
  id,
  name,
  folders,
  currentParentId,
}: {
  open: boolean;
  onClose: () => void;
  kind: "folder" | "file";
  id: string;
  name: string;
  folders: FolderOption[];
  currentParentId: string | null;
}) {
  const action = kind === "folder" ? moveFolderAction : moveFileAction;
  const { error, pending, submit } = useDialogAction(action, onClose);

  // A folder cannot go inside itself or its own descendants — that detaches
  // the branch from every root. The server refuses it too; this stops the
  // option being offered in the first place.
  const excluded = kind === "folder" ? descendantsOf(id, folders) : new Set<string>();
  const options = folders.filter((f) => !excluded.has(f.id));

  return (
    <Modal open={open} onClose={onClose} title={`Move ${name}`}>
      <form action={submit}>
        <input type="hidden" name={kind === "folder" ? "folderId" : "fileId"} value={id} />
        <Field
          label="Destination"
          help={
            kind === "folder"
              ? "A folder can't be moved into itself or anything inside it."
              : undefined
          }
        >
          <select
            name={kind === "folder" ? "parentId" : "folderId"}
            defaultValue={currentParentId ?? ""}
            className={fieldInputClass}
            // A file must live in a folder; only a folder can sit at the root.
            required={kind === "file"}
          >
            {kind === "folder" && <option value="">Top level</option>}
            {options.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </Field>
        <ErrorLine message={error} />
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || (kind === "file" && options.length === 0)}>
            {pending ? "Moving…" : "Move"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

// --- Delete ----------------------------------------------------------------

export function DeleteDialog({
  open,
  onClose,
  kind,
  id,
  name,
}: {
  open: boolean;
  onClose: () => void;
  kind: "folder" | "file";
  id: string;
  name: string;
}) {
  const action = kind === "folder" ? deleteFolderAction : deleteFileAction;
  const { error, pending, submit } = useDialogAction(action, onClose);
  const [contents, setContents] = useState<{ folders: number; files: number } | null>(null);
  const [counting, setCounting] = useState(false);

  // Counted when the dialog opens, not when the card renders: walking a
  // subtree costs a query per level, and doing that for every card on the page
  // to fill a dialog most of them never show is work nobody asked for.
  useEffect(() => {
    if (!open || kind !== "folder") return;
    let cancelled = false;
    setCounting(true);
    void folderContentsAction(id).then((result) => {
      if (cancelled) return;
      setCounting(false);
      if (result.ok) setContents({ folders: result.folders, files: result.files });
    });
    return () => {
      cancelled = true;
    };
  }, [open, kind, id]);

  const nested = contents && (contents.folders > 0 || contents.files > 0);

  return (
    <Modal open={open} onClose={onClose} title={`Delete ${name}?`}>
      <form action={submit}>
        <input type="hidden" name={kind === "folder" ? "folderId" : "fileId"} value={id} />
        {/* Never a silent cascade: if deleting takes other things with it, the
            confirmation says exactly how many before it happens. */}
        {counting ? (
          <p className="text-sm text-slate">Checking what&rsquo;s inside…</p>
        ) : nested ? (
          <p className="text-sm text-ink">
            This also removes{" "}
            <strong>
              {contents!.folders > 0 &&
                `${contents!.folders} subfolder${contents!.folders === 1 ? "" : "s"}`}
              {contents!.folders > 0 && contents!.files > 0 && " and "}
              {contents!.files > 0 && `${contents!.files} file${contents!.files === 1 ? "" : "s"}`}
            </strong>
            .
          </p>
        ) : (
          <p className="text-sm text-ink">
            {kind === "folder" ? "This folder is empty." : "This file will be removed."}
          </p>
        )}
        <p className="mt-2 text-xs text-slate">
          Removed items stop appearing in the library but are retained in the record, so an
          academy admin can recover them.
        </p>
        <ErrorLine message={error} />
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive" disabled={pending}>
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

// --- Share -----------------------------------------------------------------

export function ShareDialog({
  open,
  onClose,
  folderId,
  name,
  isShared,
}: {
  open: boolean;
  onClose: () => void;
  folderId: string;
  name: string;
  isShared: boolean;
}) {
  const { error, pending, submit } = useDialogAction(setFolderSharedAction, onClose);
  const [next, setNext] = useState(isShared);

  useEffect(() => setNext(isShared), [isShared, open]);

  return (
    <Modal open={open} onClose={onClose} title={`Who can see ${name}?`}>
      <form action={submit}>
        <input type="hidden" name="folderId" value={folderId} />
        {next && <input type="hidden" name="isShared" value="on" />}
        <fieldset className="space-y-2">
          <legend className="sr-only">Visibility</legend>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-ink/10 p-3">
            <input
              type="radio"
              name="visibility"
              checked={!next}
              onChange={() => setNext(false)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium text-ink">Coaches and admins only</span>
              <span className="block text-xs text-slate">
                Students and parents cannot see this folder or anything in it.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-ink/10 p-3">
            <input
              type="radio"
              name="visibility"
              checked={next}
              onChange={() => setNext(true)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium text-ink">Everyone in the academy</span>
              <span className="block text-xs text-slate">
                Signed-in students and parents can read and download. Still not public to the
                internet.
              </span>
            </span>
          </label>
        </fieldset>
        <ErrorLine message={error} />
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

// --- Upload ----------------------------------------------------------------

export function UploadDialog({
  open,
  onClose,
  folderId,
  folderName,
}: {
  open: boolean;
  onClose: () => void;
  folderId: string;
  folderName: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<UploadOutcome[] | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function submit(formData: FormData) {
    setError(null);
    setResults(null);
    startTransition(async () => {
      const outcome = await uploadPgnFilesAction(formData);
      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }
      // Reported per file rather than as one verdict: a batch where the third
      // file is malformed still stored the other four, and the dialog has to
      // say which is which.
      setResults(outcome.results);
      formRef.current?.reset();
    });
  }

  function close() {
    setError(null);
    setResults(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={close} title="Upload PGN files" description={`Into ${folderName}`}>
      <form ref={formRef} action={submit}>
        <input type="hidden" name="folderId" value={folderId} />
        <Field label="PGN files" help="You can select more than one. Up to 5 MB each.">
          <input
            type="file"
            name="files"
            accept=".pgn,application/x-chess-pgn,text/plain"
            multiple
            required
            className="text-sm text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-ink file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-ink/90"
          />
        </Field>

        <ErrorLine message={error} />

        {results && (
          <ul className="mt-4 space-y-1.5" aria-live="polite">
            {results.map((result) => (
              <li key={result.name} className="flex items-start gap-2 text-sm">
                <span aria-hidden="true" className={result.ok ? "text-board" : "text-brick"}>
                  {result.ok ? "✓" : "✕"}
                </span>
                <span className="min-w-0">
                  <span className="break-all font-medium text-ink">{result.name}</span>{" "}
                  <span className={result.ok ? "text-slate" : "text-brick"}>{result.message}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        <ModalFooter>
          <Button type="button" variant="secondary" onClick={close} disabled={pending}>
            {results ? "Done" : "Cancel"}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Uploading…" : "Upload"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
