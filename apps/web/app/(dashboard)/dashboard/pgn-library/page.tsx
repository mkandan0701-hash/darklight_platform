import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentSession } from "../../../../lib/auth/session";
import { formatInZone } from "../../../../lib/time";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  filterEntries,
  formatBytes,
  paginate,
  parsePageSize,
  parseSortMode,
  sortEntries,
  type LibraryEntry,
} from "../../../../lib/pgn/library";
import {
  canManageLibrary,
  getFolder,
  getFolderPath,
  listAllFolders,
  listFiles,
  listFolders,
} from "../../../../repositories/pgnRepository";
import { Badge } from "../../../../components/ui/Badge";
import {
  ChevronRight,
  FileIcon,
  Folder,
  ICON_PROPS,
  Search,
} from "../../../../components/ui/icons";
import { pageHeadingClass, textLinkClass } from "../../../../components/ui/styles";
import { LibraryToolbar } from "./LibraryToolbar";
import { NewFolderButton, UploadButton } from "./LibraryActions";
import { FileMenu, FolderMenu } from "./ItemMenu";

export const dynamic = "force-dynamic";

type Entry =
  | (LibraryEntry & {
      kind: "folder";
      isShared: boolean;
      parentId: string | null;
      fileCount: number;
    })
  | (LibraryEntry & {
      kind: "file";
      folderId: string;
      sizeBytes: number;
      gameCount: number | null;
      uploadedBy: { email: string; displayName: string | null } | null;
    });

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 flex min-h-[28rem] flex-col rounded-xl border border-ink/10 bg-white p-4 shadow-sm md:p-5">
      {children}
    </div>
  );
}

function EmptyMessage({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="font-display text-base font-semibold text-ink">{title}</p>
      <p className="max-w-sm text-sm text-slate">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export default async function PgnLibraryPage({
  searchParams,
}: {
  searchParams?: {
    folder?: string;
    q?: string;
    sort?: string;
    page?: string;
    size?: string;
  };
}) {
  const session = await getCurrentSession();
  const canManage = canManageLibrary(session.role);

  const folderId = searchParams?.folder ?? null;
  const query = (searchParams?.q ?? "").trim();
  const sort = parseSortMode(searchParams?.sort);
  const pageSize = parsePageSize(searchParams?.size);
  const requestedPage = Number(searchParams?.page ?? 1);

  // An id that resolves to nothing — deleted, another academy's, or an
  // unshared folder a student guessed — is a 404, not an empty library.
  const currentFolder = folderId ? await getFolder(session, folderId) : null;
  if (folderId && !currentFolder) notFound();

  const [folders, files, breadcrumb, allFolders] = await Promise.all([
    listFolders(session, folderId),
    currentFolder ? listFiles(session, currentFolder.id) : Promise.resolve([]),
    currentFolder ? getFolderPath(session, currentFolder.id) : Promise.resolve([]),
    canManage ? listAllFolders(session) : Promise.resolve([]),
  ]);

  const entries: Entry[] = [
    ...folders.map((f) => ({
      kind: "folder" as const,
      id: f.id,
      name: f.name,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      position: f.position,
      isShared: f.isShared,
      parentId: f.parentId,
      fileCount: f._count.files,
    })),
    ...files.map((f) => ({
      kind: "file" as const,
      id: f.id,
      name: f.name,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      position: f.position,
      folderId: f.folderId,
      sizeBytes: f.sizeBytes,
      gameCount: f.gameCount,
      uploadedBy: f.uploadedBy,
    })),
  ];

  // Folders and files page together, because the grid interleaves them —
  // paging them separately would make "18 / page" mean two different things
  // on one screen.
  const visible = sortEntries(filterEntries(entries, query), sort);
  const page = paginate(visible, requestedPage, pageSize);

  const params = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    if (folderId) next.set("folder", folderId);
    if (query) next.set("q", query);
    if (sort !== "none") next.set("sort", sort);
    if (pageSize !== DEFAULT_PAGE_SIZE) next.set("size", String(pageSize));
    if (page.page > 1) next.set("page", String(page.page));
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    return qs ? `/dashboard/pgn-library?${qs}` : "/dashboard/pgn-library";
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className={pageHeadingClass}>PGN Library</h1>
          <p className="mt-1 text-sm text-slate">
            Manage folders and PGNs for structured storage and easy access
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            {currentFolder && (
              <UploadButton folderId={currentFolder.id} folderName={currentFolder.name} />
            )}
            <NewFolderButton parentId={folderId} />
          </div>
        )}
      </div>

      <Panel>
        {breadcrumb.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1 text-sm">
            <Link href="/dashboard/pgn-library" className={textLinkClass}>
              Library
            </Link>
            {breadcrumb.map((crumb, i) => (
              <span key={crumb.id} className="flex items-center gap-1">
                <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" className="text-slate" />
                {i === breadcrumb.length - 1 ? (
                  <span aria-current="page" className="font-medium text-ink">
                    {crumb.name}
                  </span>
                ) : (
                  <Link href={`/dashboard/pgn-library?folder=${crumb.id}`} className={textLinkClass}>
                    {crumb.name}
                  </Link>
                )}
              </span>
            ))}
          </nav>
        )}

        <LibraryToolbar query={query} sort={sort} canManage={canManage} />

        {page.items.length === 0 ? (
          query ? (
            <EmptyMessage
              title="Nothing matched"
              description="No folders or PGN files match your search."
              action={
                <Link href={params({ q: null, page: null })} className={textLinkClass}>
                  Clear search
                </Link>
              }
            />
          ) : currentFolder ? (
            <EmptyMessage
              title="This folder is empty"
              description={
                canManage
                  ? "Upload a PGN file, or create a subfolder to organise this one."
                  : "Your coach hasn't added anything here yet."
              }
            />
          ) : (
            <EmptyMessage
              title="Your PGN library is empty"
              description={
                canManage
                  ? "Create your first folder to start organising games, repertoires and annotated material."
                  : "Your academy hasn't shared any PGN material with you yet."
              }
            />
          )
        ) : (
          <ul className="mt-4 grid flex-1 content-start gap-3 sm:grid-cols-2">
            {page.items.map((entry) =>
              entry.kind === "folder" ? (
                <li key={`folder-${entry.id}`}>
                  <FolderRow entry={entry} folders={allFolders} canManage={canManage} />
                </li>
              ) : (
                <li key={`file-${entry.id}`}>
                  <FileRow entry={entry} folders={allFolders} canManage={canManage} zone={session.timezone} />
                </li>
              )
            )}
          </ul>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-ink/5 pt-4">
          <p className="mr-auto text-xs text-slate">
            {page.totalItems} item{page.totalItems === 1 ? "" : "s"}
            {query && " matching"}
          </p>
          <div className="flex items-center gap-1">
            <PageLink href={params({ page: String(page.page - 1) })} enabled={page.hasPrevious} label="Previous page">
              <ChevronRight size={15} strokeWidth={2} aria-hidden="true" className="rotate-180" />
            </PageLink>
            <span
              aria-current="page"
              className="min-w-[2rem] rounded-lg border border-ink/15 px-2 py-1 text-center text-sm text-ink"
            >
              {page.page}
            </span>
            <PageLink href={params({ page: String(page.page + 1) })} enabled={page.hasNext} label="Next page">
              <ChevronRight size={15} strokeWidth={2} aria-hidden="true" />
            </PageLink>
          </div>
          <div className="flex items-center gap-1">
            {PAGE_SIZES.map((size) => (
              <Link
                key={size}
                href={params({ size: String(size), page: null })}
                aria-current={size === pageSize ? "true" : undefined}
                className={`rounded-lg px-2 py-1 text-xs ${
                  size === pageSize
                    ? "border border-ink/15 bg-white text-ink"
                    : "text-slate hover:text-ink"
                }`}
              >
                {size} / page
              </Link>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}

/** Disabled paging is a span, not a dead link — nothing to tab to or click. */
function PageLink({
  href,
  enabled,
  label,
  children,
}: {
  href: string;
  enabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const base = "flex h-7 w-7 items-center justify-center rounded-lg border border-ink/15";
  if (!enabled) {
    return (
      <span aria-disabled="true" aria-label={label} className={`${base} text-slate/40`}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className={`${base} text-ink hover:bg-parchment`}>
      {children}
    </Link>
  );
}

function FolderRow({
  entry,
  folders,
  canManage,
}: {
  entry: Extract<Entry, { kind: "folder" }>;
  folders: { id: string; name: string; parentId: string | null }[];
  canManage: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white p-3.5 transition-colors hover:bg-parchment/60 motion-reduce:transition-none">
      <Link
        href={`/dashboard/pgn-library?folder=${entry.id}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-parchment text-slate">
          <Folder {...ICON_PROPS} size={17} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink">{entry.name}</span>
          <span className="block truncate text-xs text-slate">
            {entry.fileCount} file{entry.fileCount === 1 ? "" : "s"}
          </span>
        </span>
      </Link>
      {entry.isShared && <Badge tone="success">Shared</Badge>}
      <FolderMenu
        folder={{
          id: entry.id,
          name: entry.name,
          parentId: entry.parentId,
          isShared: entry.isShared,
        }}
        folders={folders}
        canManage={canManage}
      />
    </div>
  );
}

function FileRow({
  entry,
  folders,
  canManage,
  zone,
}: {
  entry: Extract<Entry, { kind: "file" }>;
  folders: { id: string; name: string; parentId: string | null }[];
  canManage: boolean;
  zone: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white p-3.5">
      <a
        href={`/dashboard/pgn-library/download/${entry.id}`}
        className="flex min-w-0 flex-1 items-center gap-3"
        title={`Download ${entry.name}`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-board-light text-board-dark">
          <FileIcon {...ICON_PROPS} size={17} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink">{entry.name}</span>
          <span className="block truncate text-xs text-slate">
            {/* gameCount is nullable, and an unparsed file says so rather than
                claiming zero games. */}
            {entry.gameCount === null
              ? "Games not counted"
              : `${entry.gameCount} game${entry.gameCount === 1 ? "" : "s"}`}{" "}
            · {formatBytes(entry.sizeBytes)} · {formatInZone(entry.createdAt, zone).split(" at ")[0]}
          </span>
        </span>
      </a>
      <FileMenu
        file={{ id: entry.id, name: entry.name, folderId: entry.folderId }}
        folders={folders}
        canManage={canManage}
      />
    </div>
  );
}
