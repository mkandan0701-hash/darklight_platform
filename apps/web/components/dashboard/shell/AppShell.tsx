"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@chessplay-clone/shared";
import { buildNav, isActiveItem, type NavItem } from "./navLinks";
import { ChevronLeft, ICON_PROPS, Menu, X } from "../../ui/icons";

// The dashboard shell: a dark rail beside the page, header bar across the top
// of the content column.
//
// Client, because the sidebar owns three things the server cannot know: which
// route is active, whether the rail is collapsed, and whether the mobile
// drawer is open. `header` arrives as an already-rendered server node, so the
// account details inside it stay a server component.
//
// buildNav is called here rather than passed in: a NavItem carries a Lucide
// component, and functions do not cross the server/client boundary as props.

const RAIL_EXPANDED = "w-[220px]";
const RAIL_COLLAPSED = "w-[68px]";

function NavRow({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  const base =
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors motion-reduce:transition-none";

  if (item.kind === "placeholder") {
    return (
      <li>
        {/* Neither a link nor a button: there is nowhere to go and nothing to
            do. aria-disabled with no tabindex keeps it out of the tab order,
            so it reads as listed-but-unavailable rather than broken. */}
        <span
          aria-disabled="true"
          title={`${item.label} — ${item.note}`}
          className={`${base} cursor-not-allowed text-white/25`}
        >
          <Icon {...ICON_PROPS} aria-hidden="true" className="shrink-0" />
          {!collapsed && (
            <>
              <span className="truncate">{item.label}</span>
              <span className="ml-auto text-[10px] uppercase tracking-wide text-white/20">
                Soon
              </span>
            </>
          )}
        </span>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        title={collapsed ? item.label : undefined}
        className={`${base} ${
          active
            ? "bg-white/[0.14] font-medium text-white"
            : "text-white/65 hover:bg-white/[0.07] hover:text-white"
        }`}
      >
        <Icon {...ICON_PROPS} aria-hidden="true" className="shrink-0" />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    </li>
  );
}

export function AppShell({
  role,
  tenantName,
  logoUrl,
  brandColor,
  header,
  children,
}: {
  role: Role;
  tenantName: string;
  logoUrl: string | null;
  brandColor: string | null;
  header: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sections = buildNav(role);

  // A drawer that survived navigation would cover the page just asked for.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const rail = (
    <div className="flex h-full flex-col bg-ink">
      <div className="flex items-center gap-2.5 px-4 py-4">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- tenant-supplied external URL, not a static asset
          <img src={logoUrl} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />
        ) : (
          <span
            className="h-7 w-7 shrink-0 rounded-md"
            style={{ backgroundColor: brandColor ?? "#1F6D4C" }}
            aria-hidden="true"
          />
        )}
        {!collapsed && (
          <span className="truncate font-display text-sm font-bold text-white">{tenantName}</span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-pressed={collapsed}
          className="ml-auto hidden rounded p-1 text-white/45 hover:bg-white/10 hover:text-white lg:block"
        >
          <ChevronLeft
            size={16}
            strokeWidth={1.75}
            aria-hidden="true"
            className={collapsed ? "rotate-180" : ""}
          />
        </button>
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          aria-label="Close menu"
          className="ml-auto rounded p-1 text-white/45 hover:bg-white/10 hover:text-white lg:hidden"
        >
          <X size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      <nav aria-label="Dashboard" className="flex min-h-0 flex-1 flex-col">
        <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 py-1">
          {sections[0].items.map((item) => (
            <NavRow
              key={item.kind === "link" ? item.href : item.label}
              item={item}
              active={isActiveItem(item, pathname)}
              collapsed={collapsed}
              onNavigate={() => setDrawerOpen(false)}
            />
          ))}
        </ul>

        <ul className="space-y-0.5 border-t border-white/10 px-2 py-3">
          {sections[1].items.map((item) => (
            <NavRow
              key={item.kind === "link" ? item.href : item.label}
              item={item}
              active={isActiveItem(item, pathname)}
              collapsed={collapsed}
              onNavigate={() => setDrawerOpen(false)}
            />
          ))}
        </ul>
      </nav>
    </div>
  );

  return (
    <div className="min-h-screen bg-parchment">
      {/* Fixed, so the page scrolls underneath a rail that stays put. */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden lg:block ${
          collapsed ? RAIL_COLLAPSED : RAIL_EXPANDED
        } transition-[width] duration-150 motion-reduce:transition-none`}
      >
        {rail}
      </aside>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/50 lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        id="dashboard-drawer"
        className={`fixed inset-y-0 left-0 z-50 w-[220px] transition-transform duration-150 motion-reduce:transition-none lg:hidden ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!drawerOpen}
      >
        {rail}
      </aside>

      <div className={collapsed ? "lg:pl-[68px]" : "lg:pl-[220px]"}>
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-ink/10 bg-parchment/90 px-4 py-2.5 backdrop-blur md:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            aria-controls="dashboard-drawer"
            className="rounded-lg p-2 text-ink hover:bg-ink/5 lg:hidden"
          >
            <Menu {...ICON_PROPS} aria-hidden="true" />
          </button>
          <div className="ml-auto flex min-w-0 items-center gap-2">{header}</div>
        </header>
        <main className="px-4 py-5 md:px-6">{children}</main>
      </div>
    </div>
  );
}
