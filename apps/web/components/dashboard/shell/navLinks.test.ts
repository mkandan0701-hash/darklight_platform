import { describe, expect, it } from "vitest";
import { buildNav, isActiveItem, type NavItem } from "./navLinks";

function flat(role: Parameters<typeof buildNav>[0]): NavItem[] {
  return buildNav(role).flatMap((s) => s.items);
}
function labels(role: Parameters<typeof buildNav>[0]): string[] {
  return flat(role).map((i) => i.label);
}
function hrefs(role: Parameters<typeof buildNav>[0]): string[] {
  return flat(role).flatMap((i) => (i.kind === "link" ? [i.href] : []));
}

describe("role visibility", () => {
  // These mirror the rules the old inline nav enforced; the shell changed, the
  // permissions did not.
  it("gives a parent only what their portal covers", () => {
    expect(labels("PARENT")).toEqual([
      "Dashboard",
      "Classrooms",
      // Readable, not writable: a parent sees only folders staff marked
      // shared, and the repository is what enforces that.
      "PGN Library",
      "Tournaments",
      // Scoped server-side to their linked children.
      "Calendar",
      "Leaderboard",
      "Profile",
    ]);
  });

  it("keeps homework, play and billing away from a parent", () => {
    const parentHrefs = hrefs("PARENT");
    expect(parentHrefs).not.toContain("/dashboard/homework");
    expect(parentHrefs).not.toContain("/dashboard/play");
    expect(parentHrefs).not.toContain("/dashboard/billing");
  });

  it("gives a student their own record and billing, but no staff tools", () => {
    const studentHrefs = hrefs("STUDENT");
    expect(studentHrefs).toContain("/dashboard/students");
    expect(studentHrefs).toContain("/dashboard/billing");
    expect(studentHrefs).not.toContain("/dashboard/attendance");
    expect(studentHrefs).not.toContain("/dashboard/puzzles");
    expect(studentHrefs).not.toContain("/dashboard/members");
    // Same route, read-only, so the label says whose record it is.
    expect(labels("STUDENT")).toContain("My record");
    expect(labels("STUDENT")).not.toContain("Students");
  });

  it("gives a coach teaching tools but not academy administration", () => {
    const coachHrefs = hrefs("COACH");
    expect(coachHrefs).toContain("/dashboard/attendance");
    expect(coachHrefs).toContain("/dashboard/puzzles");
    expect(coachHrefs).not.toContain("/dashboard/members");
    expect(coachHrefs).not.toContain("/dashboard/settings");
    expect(coachHrefs).not.toContain("/dashboard/billing");
  });

  it("gives an admin everything, including academy and settings", () => {
    const adminHrefs = hrefs("ACADEMY_ADMIN");
    for (const href of [
      "/dashboard",
      "/dashboard/members",
      "/dashboard/classrooms",
      "/dashboard/homework",
      "/dashboard/tournaments",
      "/dashboard/simuls",
      "/dashboard/attendance",
      "/dashboard/play",
      "/dashboard/analysis",
      "/dashboard/puzzles",
      "/dashboard/games",
      "/dashboard/students",
      "/dashboard/billing",
      "/dashboard/settings",
      "/dashboard/profile",
    ]) {
      expect(adminHrefs).toContain(href);
    }
  });

  it("never points two rows at the same page", () => {
    for (const role of ["ACADEMY_ADMIN", "COACH", "STUDENT", "PARENT"] as const) {
      const list = hrefs(role);
      expect(new Set(list).size, `${role} has a duplicate href`).toBe(list.length);
    }
  });
});

describe("placeholders for features that do not exist", () => {
  // PGN Library, Calendar and Leaderboard used to sit here too, and now have
  // routes of their own — which is why this list is asserted against the real
  // placeholder count below rather than being a comment somewhere.
  const UNBUILT = ["Recordings", "Products", "Self Booking"];

  it("shows the unbuilt rows to an admin", () => {
    const adminLabels = labels("ACADEMY_ADMIN");
    for (const label of UNBUILT) expect(adminLabels).toContain(label);
  });

  // A placeholder has no href *by its type*, so there is nothing to click and
  // nothing a refactor could accidentally make navigable.
  it("gives a placeholder no destination at all", () => {
    const placeholders = flat("ACADEMY_ADMIN").filter((i) => i.kind === "placeholder");
    expect(placeholders).toHaveLength(UNBUILT.length);
    for (const item of placeholders) {
      expect(item).not.toHaveProperty("href");
      expect(item.kind === "placeholder" && item.note).toBe("Not built yet");
    }
  });

  it("lists PGN Library as a real destination, for every role", () => {
    for (const role of ["ACADEMY_ADMIN", "COACH", "STUDENT", "PARENT"] as const) {
      const item = flat(role).find((i) => i.label === "PGN Library");
      expect(item, role).toBeDefined();
      expect(item!.kind, role).toBe("link");
    }
  });

  it("lists Calendar as a real destination, for every role", () => {
    for (const role of ["ACADEMY_ADMIN", "COACH", "STUDENT", "PARENT"] as const) {
      const item = flat(role).find((i) => i.label === "Calendar");
      expect(item, role).toBeDefined();
      expect(item!.kind === "link" && item!.href, role).toBe("/dashboard/calendar");
    }
  });

  it("lists Leaderboard as a real destination, for every role", () => {
    for (const role of ["ACADEMY_ADMIN", "COACH", "STUDENT", "PARENT"] as const) {
      const item = flat(role).find((i) => i.label === "Leaderboard");
      expect(item!.kind === "link" && item!.href, role).toBe("/dashboard/leaderboard");
    }
  });

  it("hides them from everyone else rather than teasing a roadmap", () => {
    for (const role of ["COACH", "STUDENT", "PARENT"] as const) {
      expect(flat(role).some((i) => i.kind === "placeholder")).toBe(false);
    }
  });
});

describe("isActiveItem", () => {
  const dashboard = flat("ACADEMY_ADMIN").find((i) => i.label === "Dashboard")!;
  const classrooms = flat("ACADEMY_ADMIN").find((i) => i.label === "Classrooms")!;

  // The bug in the nav this replaces: /dashboard is a prefix of every route,
  // so a startsWith check lit Dashboard up on every page in the app.
  it("does not light Dashboard up on a sibling route", () => {
    expect(isActiveItem(dashboard, "/dashboard")).toBe(true);
    expect(isActiveItem(dashboard, "/dashboard/games")).toBe(false);
    expect(isActiveItem(dashboard, "/dashboard/classrooms/abc")).toBe(false);
  });

  it("keeps a section active on its own child routes", () => {
    expect(isActiveItem(classrooms, "/dashboard/classrooms")).toBe(true);
    expect(isActiveItem(classrooms, "/dashboard/classrooms/abc/sessions/def")).toBe(true);
    expect(isActiveItem(classrooms, "/dashboard/games")).toBe(false);
  });

  it("is never active for a placeholder, or without a path", () => {
    const placeholder = flat("ACADEMY_ADMIN").find((i) => i.kind === "placeholder")!;
    expect(isActiveItem(placeholder, "/dashboard")).toBe(false);
    expect(isActiveItem(dashboard, null)).toBe(false);
  });
});
