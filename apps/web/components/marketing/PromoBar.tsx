"use client";

import { useState } from "react";
import { BOOK_DEMO_URL } from "./config";

export function PromoBar() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="relative flex items-center justify-center gap-2 bg-board px-10 py-2.5 text-center text-sm text-white">
      <span>
        Curious how it actually works?{" "}
        <a
          href={BOOK_DEMO_URL}
          className="font-semibold text-gold underline underline-offset-2 hover:text-gold-light"
        >
          Grab a free 30-min demo →
        </a>
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="absolute right-3 rounded p-1 text-white/80 hover:text-white focus-visible:ring-2 focus-visible:ring-white"
      >
        ✕
      </button>
    </div>
  );
}
