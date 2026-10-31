// Search, sort and pagination for the library view.
//
// Pure, and applied to folders and files *together*: the grid interleaves
// them, so paging them separately would give page 2 a different mix from
// page 1 and make "18 / page" mean two different things on one screen.

export type SortMode =
  | "none"
  | "name-asc"
  | "name-desc"
  | "created-desc"
  | "created-asc"
  | "updated-desc";

export const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "none", label: "None" },
  { value: "name-asc", label: "Name: A–Z" },
  { value: "name-desc", label: "Name: Z–A" },
  { value: "created-desc", label: "Recently Created" },
  { value: "created-asc", label: "Oldest Created" },
  { value: "updated-desc", label: "Recently Updated" },
];

export const PAGE_SIZES = [18, 36, 72] as const;
export const DEFAULT_PAGE_SIZE = 18;

export function parseSortMode(value: string | undefined): SortMode {
  return SORT_OPTIONS.some((o) => o.value === value) ? (value as SortMode) : "none";
}

export function parsePageSize(value: string | undefined): number {
  const n = Number(value);
  return PAGE_SIZES.includes(n as (typeof PAGE_SIZES)[number]) ? n : DEFAULT_PAGE_SIZE;
}

/** An entry in the grid — a folder or a file, normalized for sorting. */
export interface LibraryEntry {
  kind: "folder" | "file";
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  position: number;
}

/** Case-insensitive, whitespace-tolerant substring match on the name. */
export function matchesQuery(name: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;
  return name.toLowerCase().includes(needle);
}

export function filterEntries<T extends LibraryEntry>(entries: T[], query: string): T[] {
  const needle = query.trim();
  if (needle.length === 0) return entries;
  return entries.filter((e) => matchesQuery(e.name, needle));
}

/**
 * Orders the grid.
 *
 * "None" is not "unordered" — it is the library's own arrangement: folders
 * before files, then manual position, then name. That is what makes it the
 * sane default and the only mode drag-to-reorder can meaningfully write back
 * to, since every other mode is derived from a column.
 */
export function sortEntries<T extends LibraryEntry>(entries: T[], mode: SortMode): T[] {
  const sorted = [...entries];
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

  switch (mode) {
    case "name-asc":
      return sorted.sort(byName);
    case "name-desc":
      return sorted.sort((a, b) => byName(b, a));
    case "created-desc":
      return sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    case "created-asc":
      return sorted.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    case "updated-desc":
      return sorted.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    case "none":
    default:
      return sorted.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
        if (a.position !== b.position) return a.position - b.position;
        return byName(a, b);
      });
  }
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

/**
 * Slices one page.
 *
 * Clamps rather than trusting the requested page: a search that narrows forty
 * results to three while the viewer sits on page 3 must not answer with an
 * empty grid and a Next button. An empty set is one page, not zero, so the
 * footer never reads "Page 1 of 0".
 */
export function paginate<T>(items: T[], page: number, pageSize: number): Page<T> {
  const size = pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE;
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / size));
  const current = Math.min(Math.max(Number.isFinite(page) ? Math.trunc(page) : 1, 1), totalPages);
  const start = (current - 1) * size;

  return {
    items: items.slice(start, start + size),
    page: current,
    pageSize: size,
    totalItems,
    totalPages,
    hasPrevious: current > 1,
    hasNext: current < totalPages,
  };
}

/** "4.2 KB" — file sizes as a person reads them. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Folder names: no path separators, no control characters, bounded. */
export const MAX_NAME_LENGTH = 120;

export function validateName(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.trim();
  if (name.length === 0) return { ok: false, error: "Give the folder a name." };
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `Keep the name under ${MAX_NAME_LENGTH} characters.` };
  }
  // Rejected because these names end up in a Content-Disposition header on
  // download and in breadcrumbs. Nothing here is a filesystem path — contents
  // live in Postgres — but "../" in a displayed name is still a lie about
  // where something is.
  if (name.includes("/") || name.includes("\\")) {
    return { ok: false, error: "Names can't contain slashes." };
  }
  if (name === "." || name === "..") {
    return { ok: false, error: "That name isn't allowed." };
  }
  // eslint-disable-next-line no-control-regex -- control characters in a name
  // would corrupt the download header; this is the check, not a stray escape.
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    return { ok: false, error: "Names can't contain control characters." };
  }
  return { ok: true, name };
}
