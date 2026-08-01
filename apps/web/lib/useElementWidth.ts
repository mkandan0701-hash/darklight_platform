"use client";

import { useEffect, useRef, useState } from "react";

// Chessboard libraries take an explicit pixel width rather than sizing via
// CSS, so a responsive board needs its container's measured width, not a
// fixed constant — this is what makes the board shrink to fit on mobile.
export function useElementWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}
