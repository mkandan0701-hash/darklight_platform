import Link from "next/link";
import { PromoBar } from "../components/marketing/PromoBar";
import { MarketingNav } from "../components/marketing/MarketingNav";
import { Hero } from "../components/marketing/Hero";
import { StatRow } from "../components/marketing/StatRow";
import { FeatureTabs } from "../components/marketing/FeatureTabs";
import { AudienceBand } from "../components/marketing/AudienceBand";
import { Pricing } from "../components/marketing/Pricing";
import { Faq } from "../components/marketing/Faq";
import { BOOK_DEMO_URL } from "../components/marketing/config";
import { Button } from "../components/ui/Button";

export default function HomePage() {
  return (
    <main>
      <PromoBar />
      <MarketingNav />
      <Hero />
      <StatRow />
      <FeatureTabs />
      <AudienceBand />
      <Pricing />
      <Faq />

      <section className="mx-auto max-w-3xl px-6 py-20 text-center md:px-10">
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
          Ready to ditch the spreadsheets?
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-slate">
          Book a free 30-min walkthrough. We&apos;ll show you exactly how it&apos;d run for your
          students — not a generic feature tour.
        </p>
        <div className="mt-8 flex justify-center">
          <a href={BOOK_DEMO_URL}>
            <Button variant="primary" className="!px-8 !py-3.5 text-base">
              Book Demo
            </Button>
          </a>
        </div>
        <p className="mt-4 text-sm text-slate">30 mins · No pitch, no pressure</p>
      </section>

      <footer className="border-t border-ink/10 px-6 py-8 text-center text-xs text-slate md:px-10">
        <p>Chess Academy Platform — built for diaspora chess academies.</p>
        <p className="mt-2">
          Already a member?{" "}
          <Link href="/login" className="font-medium text-board hover:underline">
            Sign in
          </Link>
        </p>
      </footer>
    </main>
  );
}
