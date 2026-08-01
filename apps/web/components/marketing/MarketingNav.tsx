import Link from "next/link";
import { Button } from "../ui/Button";
import { BOOK_DEMO_URL } from "./config";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#audience", label: "Who it's for" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function MarketingNav() {
  return (
    <nav className="flex items-center justify-between px-6 py-4 md:px-10">
      <Link href="/" className="flex items-center gap-2">
        <KnightIcon />
        <span className="font-display text-lg font-bold tracking-tight text-ink">
          Chess Academy Platform
        </span>
      </Link>
      <div className="hidden items-center gap-8 text-sm font-medium text-ink/70 md:flex">
        {NAV_LINKS.map((link) => (
          <a key={link.href} href={link.href} className="hover:text-ink">
            {link.label}
          </a>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <a href={BOOK_DEMO_URL}>
          <Button variant="primary" className="!px-5 !py-2.5 text-sm">
            Book Demo
          </Button>
        </a>
      </div>
    </nav>
  );
}

function KnightIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" className="text-ink" aria-hidden="true">
      <path d="M7 21v-2h9v2H7Zm1.2-4c-.3-1.6-.2-2.9.6-4.1.8-1.2 1-1.6.6-2.6-.3-.8-1-1-1.7-.6-.4.2-.7.1-.8-.3-.2-.9.3-2 1.3-2.7C9.6 5.7 11.6 5 13 5c2.3 0 4 1.8 4 4.3 0 1.6-.6 2.4-1.4 3.3-1 1.1-1.3 1.8-1.3 3.1V17H8.2Z" />
    </svg>
  );
}
