"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLink = { href: string; label: string };

export function DashboardNav({
  tenantName,
  logoUrl,
  brandColor,
  links,
  logoutAction,
}: {
  tenantName: string;
  logoUrl: string | null;
  brandColor: string | null;
  links: NavLink[];
  logoutAction: () => void | Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-10 border-b border-ink/10 bg-white/90 backdrop-blur">
      <div className="flex items-center justify-between px-6 py-3.5 md:px-8">
        <div className="flex items-center gap-2.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- tenant-supplied external URL, not a static asset
            <img src={logoUrl} alt="" className="h-7 w-7 rounded object-cover" />
          ) : (
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: brandColor ?? "#1F6D4C" }}
              aria-hidden="true"
            />
          )}
          <span className="font-display text-base font-semibold text-ink">{tenantName}</span>
        </div>

        <div className="hidden items-center gap-6 text-sm font-medium text-slate md:flex">
          {links.map((link) => {
            const active = pathname === link.href || pathname?.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={active ? "text-ink" : "hover:text-ink"}
              >
                {link.label}
              </Link>
            );
          })}
          <form action={logoutAction}>
            <button type="submit" className="text-slate hover:text-ink">
              Log out
            </button>
          </form>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="rounded p-2 text-ink md:hidden"
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-1 border-t border-ink/10 px-6 py-3 text-sm font-medium text-slate md:hidden">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded px-2 py-2 hover:bg-parchment hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
          <form action={logoutAction}>
            <button type="submit" className="rounded px-2 py-2 text-left hover:bg-parchment hover:text-ink">
              Log out
            </button>
          </form>
        </div>
      )}
    </nav>
  );
}
