import type { Role } from "@chessplay-clone/shared";
import {
  Activity,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  FileText,
  Gauge,
  GraduationCap,
  LayoutDashboard,
  LineChart,
  Package,
  Play,
  Puzzle,
  School,
  Settings,
  Swords,
  Trophy,
  User,
  Users,
  Video,
  type LucideIcon,
} from "../../ui/icons";

// The sidebar's contents, as data — extracted from the inline array that used
// to live in app/(dashboard)/layout.tsx so the role rules can be tested without
// rendering a page.
//
// A link and a placeholder are different shapes rather than one shape with a
// flag: a "disabled" item has no href to accidentally render, and TypeScript
// enforces that rather than a convention.

export type NavItem =
  | { kind: "link"; href: string; label: string; icon: LucideIcon; exact?: boolean }
  | { kind: "placeholder"; label: string; icon: LucideIcon; note: string };

export interface NavSection {
  id: "main" | "footer";
  items: NavItem[];
}

const NOT_BUILT = "Not built yet";

function can(role: Role, ...allowed: Role[]): boolean {
  return allowed.includes(role);
}

/**
 * The sidebar for one role.
 *
 * Order follows the reference design. Some of its rows — Recordings,
 * Products, Self Booking — have no model,
 * no route and no data in this product, so they render as placeholders rather
 * than as links to somewhere arbitrary. They are shown to an academy admin
 * only: a student has no use for a roadmap, and teasing a parent with a
 * feature that does not exist is worse than omitting it.
 *
 * The reference's "Fee Collection" is this app's Billing, which already has a
 * row of its own below, so it is not repeated here.
 */
export function buildNav(role: Role): NavSection[] {
  const isAdmin = can(role, "ACADEMY_ADMIN");
  const isStaff = can(role, "ACADEMY_ADMIN", "COACH");
  const isStudent = can(role, "STUDENT");
  const isParent = can(role, "PARENT");

  const placeholder = (label: string, icon: LucideIcon): NavItem[] =>
    isAdmin ? [{ kind: "placeholder" as const, label, icon, note: NOT_BUILT }] : [];

  const main: NavItem[] = [
    // `exact`, because /dashboard is a prefix of every other route here — the
    // old nav's startsWith check lit this row up on every page in the app.
    { kind: "link", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
    // The reference calls this "Academy". Here that is the roster of people in
    // it; academy-wide configuration is Settings, in the footer.
    ...(isAdmin
      ? [{ kind: "link" as const, href: "/dashboard/members", label: "Academy", icon: School }]
      : []),
    { kind: "link", href: "/dashboard/classrooms", label: "Classrooms", icon: GraduationCap },
    // Staff curate it; students and parents see folders shared with them, so
    // unlike the placeholders below this row is for everyone.
    { kind: "link", href: "/dashboard/pgn-library", label: "PGN Library", icon: FileText },
    ...(isParent
      ? []
      : [{ kind: "link" as const, href: "/dashboard/homework", label: "Homework", icon: BookOpen }]),
    ...placeholder("Recordings", Video),
    ...placeholder("Products", Package),
    { kind: "link", href: "/dashboard/tournaments", label: "Tournaments", icon: Trophy },
    ...(isParent
      ? []
      : [{ kind: "link" as const, href: "/dashboard/simuls", label: "Simuls", icon: Swords }]),
    ...(isStaff
      ? [
          {
            kind: "link" as const,
            href: "/dashboard/attendance",
            label: "Attendance",
            icon: ClipboardCheck,
          },
        ]
      : []),
    ...placeholder("Self Booking", CalendarDays),
    // Everyone: each role's calendar is scoped server-side to what they may see.
    { kind: "link", href: "/dashboard/calendar", label: "Calendar", icon: CalendarDays },
    // Classroom standings only (claude.md §9); the page offers only the
    // viewer's own rooms.
    { kind: "link", href: "/dashboard/leaderboard", label: "Leaderboard", icon: Gauge },
    ...(isParent
      ? []
      : [
          { kind: "link" as const, href: "/dashboard/play", label: "Play Area", icon: Play },
          {
            kind: "link" as const,
            href: "/dashboard/analysis",
            label: "Analysis Board",
            icon: LineChart,
          },
        ]),
    // Below the reference's list: real features it does not have a row for.
    // Dropping them would cost nav access to five working parts of this app.
    ...(isStaff
      ? [{ kind: "link" as const, href: "/dashboard/puzzles", label: "Puzzles", icon: Puzzle }]
      : []),
    ...(isStaff || isStudent
      ? [{ kind: "link" as const, href: "/dashboard/games", label: "Games", icon: Activity }]
      : []),
    ...(isStaff || isStudent
      ? [
          {
            kind: "link" as const,
            href: "/dashboard/students",
            label: isStudent ? "My record" : "Students",
            icon: Users,
          },
        ]
      : []),
  ];

  const footer: NavItem[] = [
    ...(isAdmin || isStudent
      ? [
          {
            kind: "link" as const,
            href: "/dashboard/billing",
            label: "Billing & Invoices",
            icon: CreditCard,
          },
        ]
      : []),
    ...(isAdmin
      ? [{ kind: "link" as const, href: "/dashboard/settings", label: "Settings", icon: Settings }]
      : []),
    { kind: "link", href: "/dashboard/profile", label: "Profile", icon: User },
  ];

  return [
    { id: "main", items: main },
    { id: "footer", items: footer },
  ];
}

/** Whether `pathname` is inside this item's route. */
export function isActiveItem(item: NavItem, pathname: string | null): boolean {
  if (item.kind !== "link" || !pathname) return false;
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
