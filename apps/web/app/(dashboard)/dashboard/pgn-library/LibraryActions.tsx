"use client";

import { useState } from "react";
import { Plus, Upload } from "../../../../components/ui/icons";
import { CreateFolderDialog, UploadDialog } from "./LibraryDialogs";

// The two page-level buttons. Client only because they own dialog state; the
// work itself happens in server actions.

export function NewFolderButton({ parentId }: { parentId: string | null }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink/90 motion-reduce:transition-none"
      >
        <Plus size={16} strokeWidth={2.25} aria-hidden="true" />
        New Folder
      </button>
      <CreateFolderDialog open={open} onClose={() => setOpen(false)} parentId={parentId} />
    </>
  );
}

export function UploadButton({
  folderId,
  folderName,
}: {
  folderId: string;
  folderName: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-ink/20 bg-white px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-ink/5 motion-reduce:transition-none"
      >
        <Upload size={16} strokeWidth={2} aria-hidden="true" />
        Upload PGN
      </button>
      <UploadDialog
        open={open}
        onClose={() => setOpen(false)}
        folderId={folderId}
        folderName={folderName}
      />
    </>
  );
}
