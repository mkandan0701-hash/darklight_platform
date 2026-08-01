import Link from "next/link";
import { Button } from "../ui/Button";
import { HeroIllustration } from "./HeroIllustration";
import { BOOK_DEMO_URL } from "./config";

export function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-12 md:grid-cols-[1.05fr_1fr] md:items-center md:px-10 md:pt-20">
      <div>
        <span className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs font-semibold text-ink shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-board" />
          Made for coaches teaching across time zones
        </span>

        <h1 className="mt-6 font-display text-[2.75rem] font-extrabold leading-[1.05] tracking-tight text-ink md:text-6xl">
          Your whole academy.
          <br />
          <span className="text-board">One tab.</span>
        </h1>

        <p className="mt-6 max-w-lg text-lg leading-relaxed text-slate">
          Classes, homework, live boards, scheduling and payments — finally in one place. Built for
          coaches teaching students across the US, UK and India.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a href={BOOK_DEMO_URL}>
            <Button variant="primary" className="!px-6 !py-3 text-base">
              Book Demo
            </Button>
          </a>
          <Link href="#features">
            <Button variant="secondary" className="!px-6 !py-3 text-base">
              See how it works
            </Button>
          </Link>
        </div>

        <p className="mt-4 text-sm text-slate">
          30 mins · No pitch, no pressure
        </p>
      </div>

      <div className="relative">
        <HeroIllustration />
      </div>
    </section>
  );
}
