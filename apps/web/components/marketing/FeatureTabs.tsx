"use client";

import { useState } from "react";
import {
  HomeworkArt,
  InvoicingArt,
  LiveClassroomArt,
  ParentPortalArt,
  SchedulingArt,
} from "./FeatureArt";

const TABS = [
  {
    label: "Live classroom",
    Art: LiveClassroomArt,
    heading: "Coach and students, one shared board",
    points: [
      "Every move is validated server-side before it reaches other players.",
      "The coach keeps a private reference board in its own room.",
      "Audio built in — no separate video call to juggle.",
    ],
  },
  {
    label: "Homework & puzzles",
    Art: HomeworkArt,
    heading: "See exactly how a student solved it",
    points: [
      "Every attempted move is logged, not just the final answer.",
      "Coaches filter the puzzle set by rating before assigning.",
      "Students see per-puzzle status: solved, attempted, not started.",
    ],
  },
  {
    label: "Scheduling",
    Art: SchedulingArt,
    heading: "One session time, every time zone",
    points: [
      "Coaches schedule once; students and parents see their own local time.",
      "Weekend-first templates match how diaspora families actually book lessons.",
      "No more \"is that 7pm my time or yours\" messages.",
    ],
  },
  {
    label: "Invoicing",
    Art: InvoicingArt,
    heading: "Bill the way each family pays",
    points: [
      "USD via Stripe, INR via Razorpay — same invoice model, no manual math.",
      "Every amount stores its currency; nothing gets silently converted.",
      "Built for the $49/month academy, not an enterprise billing team.",
    ],
  },
  {
    label: "Parent portal",
    Art: ParentPortalArt,
    heading: "The view parents actually check",
    points: [
      "Attendance, homework progress, and upcoming sessions in one place.",
      "One parent account can follow more than one student.",
      "Branded progress reports, not a raw activity log.",
    ],
  },
] as const;

export function FeatureTabs() {
  const [active, setActive] = useState(0);
  const tab = TABS[active];

  return (
    <section id="features" className="mx-auto max-w-6xl px-6 py-20 md:px-10">
      <div className="text-center">
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
          Five apps&apos; worth of stuff. One place.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-slate">
          The tools you&apos;re currently duct-taping together, actually built to work as one.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Product features"
        className="mt-10 flex flex-wrap justify-center gap-2 border-b border-ink/10"
      >
        {TABS.map((t, i) => (
          <button
            key={t.label}
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors motion-reduce:transition-none ${
              i === active
                ? "border-board text-board"
                : "border-transparent text-slate hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="mt-8 grid gap-8 rounded-2xl bg-parchment p-8 md:grid-cols-2 md:p-10">
        <div>
          <h3 className="font-display text-2xl font-bold tracking-tight text-ink">{tab.heading}</h3>
          <ul className="mt-5 space-y-3.5 text-[15px] leading-relaxed text-ink/80">
            {tab.points.map((point) => (
              <li key={point} className="flex gap-2.5">
                <span className="mt-0.5 font-semibold text-board">✓</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="self-center">
          <tab.Art />
        </div>
      </div>
    </section>
  );
}
