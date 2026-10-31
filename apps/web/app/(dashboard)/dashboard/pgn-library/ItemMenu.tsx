"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  Download,
  Eye,
  FolderInput,
  FolderOpen,
  ICON_PROPS,
  MoreVertical,
  Pencil,
  Trash2,
} from "../../../../components/ui/icons";
import {
  DeleteDialog,
  MoveDialog,
  RenameDialog,
  ShareDialog,
  type FolderOption,
} from "./LibraryDialogs";

// The three-dot menu on a card or row.
//
// Only ever lists actions this viewer can actually perform — but the gating
// that matters is in the server action, not here. Hiding Delete from a student
// is a courtesy; refusing their POST is the security.

type MenuItem =
  | { kind: "link"; label: string; href: string; icon: typeof Pencil }
  | { kind: "button"; label: string; onSelect: () => void; icon: typeof Pencil; danger?: boolean };

function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={label}
        className="rounded-lg p-1.5 text-slate hover:bg-ink/5 hover:text-ink"
      >
        <MoreVertical {...ICON_PROPS} size={17} aria-hidden="true" />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-xl border border-ink/10 bg-white py-1 shadow-lg"
        >
          {items.map((item) =>
            item.kind === "link" ? (
              <Link
                key={item.label}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-ink hover:bg-parchment"
              >
                <item.icon size={15} strokeWidth={1.75} aria-hidden="true" className="text-slate" />
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-parchment ${
                  item.danger ? "text-brick" : "text-ink"
                }`}
              >
                <item.icon
                  size={15}
                  strokeWidth={1.75}
                  aria-hidden="true"
                  className={item.danger ? "text-brick" : "text-slate"}
                />
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

type Dialog = "rename" | "move" | "delete" | "share" | null;

export function FolderMenu({
  folder,
  folders,
  canManage,
}: {
  folder: { id: string; name: string; parentId: string | null; isShared: boolean };
  folders: FolderOption[];
  canManage: boolean;
}) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);

  const items: MenuItem[] = [
    { kind: "link", label: "Open", href: `/dashboard/pgn-library?folder=${folder.id}`, icon: FolderOpen },
    ...(canManage
      ? ([
          { kind: "button", label: "Rename", onSelect: () => setDialog("rename"), icon: Pencil },
          { kind: "button", label: "Move", onSelect: () => setDialog("move"), icon: FolderInput },
          {
            kind: "button",
            label: folder.isShared ? "Make staff-only" : "Share with academy",
            onSelect: () => setDialog("share"),
            icon: Eye,
          },
          {
            kind: "button",
            label: "Delete",
            onSelect: () => setDialog("delete"),
            icon: Trash2,
            danger: true,
          },
        ] as MenuItem[])
      : []),
  ];

  return (
    <>
      <Menu label={`Actions for ${folder.name}`} items={items} />
      <RenameDialog
        open={dialog === "rename"}
        onClose={close}
        kind="folder"
        id={folder.id}
        currentName={folder.name}
      />
      <MoveDialog
        open={dialog === "move"}
        onClose={close}
        kind="folder"
        id={folder.id}
        name={folder.name}
        folders={folders}
        currentParentId={folder.parentId}
      />
      <ShareDialog
        open={dialog === "share"}
        onClose={close}
        folderId={folder.id}
        name={folder.name}
        isShared={folder.isShared}
      />
      <DeleteDialog
        open={dialog === "delete"}
        onClose={close}
        kind="folder"
        id={folder.id}
        name={folder.name}
      />
    </>
  );
}

export function FileMenu({
  file,
  folders,
  canManage,
}: {
  file: { id: string; name: string; folderId: string };
  folders: FolderOption[];
  canManage: boolean;
}) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);

  const items: MenuItem[] = [
    {
      kind: "link",
      label: "Download",
      href: `/dashboard/pgn-library/download/${file.id}`,
      icon: Download,
    },
    ...(canManage
      ? ([
          { kind: "button", label: "Rename", onSelect: () => setDialog("rename"), icon: Pencil },
          { kind: "button", label: "Move", onSelect: () => setDialog("move"), icon: FolderInput },
          {
            kind: "button",
            label: "Delete",
            onSelect: () => setDialog("delete"),
            icon: Trash2,
            danger: true,
          },
        ] as MenuItem[])
      : []),
  ];

  return (
    <>
      <Menu label={`Actions for ${file.name}`} items={items} />
      <RenameDialog
        open={dialog === "rename"}
        onClose={close}
        kind="file"
        id={file.id}
        currentName={file.name}
      />
      <MoveDialog
        open={dialog === "move"}
        onClose={close}
        kind="file"
        id={file.id}
        name={file.name}
        folders={folders}
        currentParentId={file.folderId}
      />
      <DeleteDialog
        open={dialog === "delete"}
        onClose={close}
        kind="file"
        id={file.id}
        name={file.name}
      />
    </>
  );
}
