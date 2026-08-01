import Link from "next/link";
import type { Metadata } from "next";
import { BookDemoScheduler } from "../../components/marketing/BookDemoScheduler";
import { SLOT_DURATION_MINS } from "../../lib/demoSlots";

export const metadata: Metadata = {
  title: "Book a demo — Chess Academy Platform",
  description:
    "Book a free 30-minute walkthrough of the platform for your chess academy.",
};

const COVERED = [
  "How classes, homework and live boards fit your actual teaching week",
  "Scheduling that just works across your students' time zones",
  "Getting paid in USD and INR without the manual math",
  "What moving your academy over would really take",
];

export default function BookDemoPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12 md:px-10 md:py-16">
      <Link
        href="/"
        className="text-sm font-medium text-slate hover:text-ink"
      >
        ← Back to home
      </Link>

      <div className="mt-8 grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-white">
              <KnightIcon />
            </span>
            <div>
              <p className="font-display text-sm font-bold tracking-tight text-ink">
                Chess Academy Platform
              </p>
              <p className="text-xs text-slate">Product walkthrough</p>
            </div>
          </div>

          <h1 className="mt-6 font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
            Let&apos;s show you around
          </h1>

          <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs font-semibold text-ink shadow-sm">
            <span aria-hidden="true">🕐</span>
            {SLOT_DURATION_MINS} minutes
          </span>

          <p className="mt-6 text-[15px] leading-relaxed text-slate">
            Quick, chill, and actually useful. We&apos;ll look at how your academy runs right now
            and show you the bits that would genuinely change your week — no pitch, no generic
            feature tour.
          </p>

          <p className="mt-6 text-sm font-semibold text-ink">What we&apos;ll cover</p>
          <ul className="mt-3 space-y-2.5 text-[15px] leading-relaxed text-ink/80">
            {COVERED.map((item) => (
              <li key={item} className="flex gap-2.5">
                <span className="mt-0.5 font-semibold text-board">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <p className="mt-8 text-sm text-slate">
            Prefer email?{" "}
            <a href="mailto:hello@example.com" className="font-medium text-board hover:underline">
              Send us a message
            </a>{" "}
            instead.
          </p>
        </div>

        <BookDemoScheduler />
      </div>
    </main>
  );
}

function KnightIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
      <path d="M7 21v-2h9v2H7Zm1.2-4c-.3-1.6-.2-2.9.6-4.1.8-1.2 1-1.6.6-2.6-.3-.8-1-1-1.7-.6-.4.2-.7.1-.8-.3-.2-.9.3-2 1.3-2.7C9.6 5.7 11.6 5 13 5c2.3 0 4 1.8 4 4.3 0 1.6-.6 2.4-1.4 3.3-1 1.1-1.3 1.8-1.3 3.1V17H8.2Z" />
    </svg>
  );
}
