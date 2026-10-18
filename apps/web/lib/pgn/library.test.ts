import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  filterEntries,
  formatBytes,
  matchesQuery,
  paginate,
  parsePageSize,
  parseSortMode,
  sortEntries,
  validateName,
  type LibraryEntry,
} from "./library";

const at = (iso: string) => new Date(iso);

const entry = (
  over: Partial<LibraryEntry> & Pick<LibraryEntry, "name" | "kind">
): LibraryEntry => ({
  id: over.name,
  createdAt: at("2026-01-01T00:00:00Z"),
  updatedAt: at("2026-01-01T00:00:00Z"),
  position: 0,
  ...over,
});

describe("search", () => {
  it("is case-insensitive and matches anywhere in the name", () => {
    expect(matchesQuery("Sicilian Najdorf", "najdorf")).toBe(true);
    expect(matchesQuery("Sicilian Najdorf", "SICILIAN")).toBe(true);
    expect(matchesQuery("Sicilian Najdorf", "cili")).toBe(true);
    expect(matchesQuery("Sicilian Najdorf", "caro")).toBe(false);
  });

  it("ignores padding the user did not mean to type", () => {
    expect(matchesQuery("Public", "  public  ")).toBe(true);
    // A query of only spaces is an empty query, not a search for a space.
    expect(matchesQuery("Public", "   ")).toBe(true);
  });

  it("searches folders and files alike", () => {
    const entries = [
      entry({ kind: "folder", name: "Openings" }),
      entry({ kind: "file", name: "najdorf.pgn" }),
      entry({ kind: "file", name: "endgames.pgn" }),
    ];
    expect(filterEntries(entries, "n").map((e) => e.name)).toEqual([
      "Openings",
      "najdorf.pgn",
      "endgames.pgn",
    ]);
    expect(filterEntries(entries, "najd").map((e) => e.name)).toEqual(["najdorf.pgn"]);
  });

  it("returns everything for an empty query rather than nothing", () => {
    const entries = [entry({ kind: "folder", name: "A" })];
    expect(filterEntries(entries, "")).toHaveLength(1);
  });
});

describe("sorting", () => {
  const entries: LibraryEntry[] = [
    entry({
      kind: "file",
      name: "beta.pgn",
      position: 1,
      createdAt: at("2026-03-01T00:00:00Z"),
      updatedAt: at("2026-05-01T00:00:00Z"),
    }),
    entry({
      kind: "folder",
      name: "Zebra",
      position: 2,
      createdAt: at("2026-01-01T00:00:00Z"),
      updatedAt: at("2026-06-01T00:00:00Z"),
    }),
    entry({
      kind: "folder",
      name: "alpha",
      position: 1,
      createdAt: at("2026-02-01T00:00:00Z"),
      updatedAt: at("2026-04-01T00:00:00Z"),
    }),
  ];

  // "None" means the library's own arrangement, not "unordered" — and it is
  // the only mode drag-to-reorder could write back to, since every other mode
  // is derived from a column.
  it("puts folders before files, then position, then name, under None", () => {
    expect(sortEntries(entries, "none").map((e) => e.name)).toEqual(["alpha", "Zebra", "beta.pgn"]);
  });

  it("sorts by name in both directions, ignoring case", () => {
    expect(sortEntries(entries, "name-asc").map((e) => e.name)).toEqual([
      "alpha",
      "beta.pgn",
      "Zebra",
    ]);
    expect(sortEntries(entries, "name-desc").map((e) => e.name)).toEqual([
      "Zebra",
      "beta.pgn",
      "alpha",
    ]);
  });

  it("sorts by created and updated dates", () => {
    expect(sortEntries(entries, "created-desc").map((e) => e.name)).toEqual([
      "beta.pgn",
      "alpha",
      "Zebra",
    ]);
    expect(sortEntries(entries, "created-asc").map((e) => e.name)).toEqual([
      "Zebra",
      "alpha",
      "beta.pgn",
    ]);
    expect(sortEntries(entries, "updated-desc").map((e) => e.name)).toEqual([
      "Zebra",
      "beta.pgn",
      "alpha",
    ]);
  });

  it("does not mutate the array it was given", () => {
    const original = [...entries];
    sortEntries(entries, "name-asc");
    expect(entries).toEqual(original);
  });
});

describe("pagination", () => {
  const many = Array.from({ length: 40 }, (_, i) => i);

  it("slices the requested page and reports the totals", () => {
    const page = paginate(many, 2, 18);
    expect(page.items).toHaveLength(18);
    expect(page.items[0]).toBe(18);
    expect(page).toMatchObject({ page: 2, totalItems: 40, totalPages: 3 });
  });

  it("disables previous on the first page and next on the last", () => {
    expect(paginate(many, 1, 18)).toMatchObject({ hasPrevious: false, hasNext: true });
    expect(paginate(many, 3, 18)).toMatchObject({ hasPrevious: true, hasNext: false });
  });

  // A search that narrows 40 results to 3 while the viewer sits on page 3 must
  // not answer with an empty grid and a live Next button.
  it("clamps a page number past the end back to the last page", () => {
    const page = paginate([1, 2, 3], 3, 18);
    expect(page.page).toBe(1);
    expect(page.items).toEqual([1, 2, 3]);
    expect(page.hasNext).toBe(false);
  });

  it("clamps nonsense page numbers instead of producing a negative slice", () => {
    for (const bad of [0, -5, NaN, 1.7]) {
      const page = paginate(many, bad, 18);
      expect(page.page).toBeGreaterThanOrEqual(1);
      expect(page.items.length).toBeGreaterThan(0);
    }
  });

  // "Page 1 of 0" is the output of a ceil() nobody floored.
  it("treats an empty library as one page, not zero", () => {
    expect(paginate([], 1, 18)).toMatchObject({
      totalPages: 1,
      totalItems: 0,
      hasPrevious: false,
      hasNext: false,
    });
  });

  it("honours the larger page sizes", () => {
    expect(paginate(many, 1, 36).items).toHaveLength(36);
    expect(paginate(many, 1, 72)).toMatchObject({ totalPages: 1, hasNext: false });
  });
});

describe("query parameter parsing", () => {
  it("falls back to the defaults for anything unrecognised", () => {
    expect(parseSortMode(undefined)).toBe("none");
    expect(parseSortMode("totally-made-up")).toBe("none");
    expect(parseSortMode("name-asc")).toBe("name-asc");
    expect(parsePageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize("1000")).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize("-1")).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize("36")).toBe(36);
  });
});

describe("name validation", () => {
  it("trims and accepts an ordinary name", () => {
    expect(validateName("  Openings  ")).toEqual({ ok: true, name: "Openings" });
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(validateName("")).toMatchObject({ ok: false });
    expect(validateName("    ")).toMatchObject({ ok: false });
  });

  // These end up in a Content-Disposition header and in breadcrumbs.
  it("rejects path separators and traversal", () => {
    expect(validateName("a/b")).toMatchObject({ ok: false });
    expect(validateName("a\\b")).toMatchObject({ ok: false });
    expect(validateName("..")).toMatchObject({ ok: false });
    expect(validateName(".")).toMatchObject({ ok: false });
  });

  it("rejects control characters that would corrupt a download header", () => {
    expect(validateName(`bad${String.fromCharCode(10)}name`)).toMatchObject({ ok: false });
    expect(validateName(`bad${String.fromCharCode(0)}name`)).toMatchObject({ ok: false });
  });

  it("bounds the length", () => {
    expect(validateName("x".repeat(121))).toMatchObject({ ok: false });
    expect(validateName("x".repeat(120))).toMatchObject({ ok: true });
  });

  it("keeps names people actually use", () => {
    for (const name of ["Sicilian: Najdorf", "Round 1 (2026)", "Ana's games", "e4 — repertoire"]) {
      expect(validateName(name), name).toMatchObject({ ok: true });
    }
  });
});

describe("formatBytes", () => {
  it("scales the unit to the size", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(4300)).toBe("4.2 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});
