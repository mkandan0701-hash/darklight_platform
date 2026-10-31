import Image from "next/image";
import type { ReactNode } from "react";
import heroImage from "../../public/auth/children-playing-chess.webp";
import { CburnettPiece, PIECE_BOX } from "../chess/cburnett";
import { AuthBrand } from "./AuthBrand";

// The frame every auth page shares: photo on the left, form on the right.
//
// Desktop (lg+): split screen, hero ~52–55% wide with headline over a
// bottom-only gradient. Tablet: single column, a taller photo strip, no copy.
// Phone: a short strip (~144px) so the form — not the photo — is what's on
// screen first; the child should see "Create your password" without
// scrolling.
//
// The photo is a static import, so Next knows its dimensions and generates
// the blur placeholder at build time; `priority` because it is the LCP element
// on desktop, which is also why it is NOT lazy-loaded. Its container has an
// ink→board gradient behind it, so a failed load degrades to a branded panel
// rather than a broken-image icon. Source and licence: public/auth/README.md.

const HERO_COPY = {
  learner: {
    headline: "Every great player starts with one move.",
    body: "Learn, practice, and grow your confidence one game at a time.",
  },
  academy: {
    headline: "Bring your whole academy to one board.",
    body: "Classes, homework, and parent updates — in every family's own time zone.",
  },
} as const;

export type AuthHeroVariant = keyof typeof HERO_COPY;

export function AuthShell({
  children,
  heroVariant = "learner",
  footer,
  brandLinked = true,
}: {
  children: ReactNode;
  heroVariant?: AuthHeroVariant;
  footer?: ReactNode;
  /**
   * Whether the brand mark links home. Off during account setup, where any
   * way off the page is a way to abandon activation half-done.
   */
  brandLinked?: boolean;
}) {
  const copy = HERO_COPY[heroVariant];

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-white lg:flex-row">
      <aside className="relative h-36 shrink-0 overflow-hidden bg-gradient-to-br from-ink via-ink to-board-dark sm:h-56 lg:sticky lg:top-0 lg:h-screen lg:w-[52%] xl:w-[55%]">
        <Image
          src={heroImage}
          alt="Two children playing chess together at a classroom table"
          fill
          priority
          placeholder="blur"
          // On lg+ the panel is taller than it is wide, so object-cover scales
          // the 3:2 photo to the panel's *height*: rendered width ≈ 1.5 × 100vh,
          // not the panel's 55vw. Saying "55vw" here made Next pick a variant
          // a third too narrow and the photo came out visibly soft.
          sizes="(min-width: 1024px) 150vh, 100vw"
          className="object-cover object-[62%_40%]"
        />
        {/* Contrast only where the text sits: the bottom third on desktop,
            a whisper on the mobile strip so the photo stays bright. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-ink/25 to-transparent lg:from-ink/90 lg:via-ink/30 lg:via-45% lg:to-transparent"
        />

        <div className="absolute inset-x-0 bottom-0 hidden p-10 text-white lg:block xl:p-14">
          <div className="max-w-lg">
            <span
              aria-hidden="true"
              className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/95 shadow-lg shadow-ink/30 ring-1 ring-white/40"
            >
              <svg viewBox={`0 0 ${PIECE_BOX} ${PIECE_BOX}`} className="h-10 w-10" focusable="false">
                <CburnettPiece kind="n" isWhite />
              </svg>
            </span>
            <p className="font-display text-4xl font-bold leading-[1.1] tracking-tight [text-wrap:balance] xl:text-5xl">
              {copy.headline}
            </p>
            <p className="mt-4 text-lg leading-relaxed text-white/85 [text-wrap:pretty]">{copy.body}</p>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col px-4 sm:px-8 lg:px-12">
        <header className="pt-6 sm:pt-8 lg:pt-10">
          <AuthBrand linked={brandLinked} />
        </header>
        <main className="flex flex-1 items-center justify-center py-8 sm:py-10 lg:py-12">
          <div className="w-full max-w-md">{children}</div>
        </main>
        {footer && (
          <footer className="pb-6 text-center text-sm text-slate sm:pb-8">{footer}</footer>
        )}
      </div>
    </div>
  );
}
