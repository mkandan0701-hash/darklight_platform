import type { HTMLAttributes } from "react";
import { Card } from "./Card";

// Placeholders for the Suspense boundaries on the dashboard. The first ones in
// this app: every page before it rendered fully blocking, so nothing appeared
// until the slowest query returned.
//
// animate-pulse is already covered by the prefers-reduced-motion rule in
// globals.css, which zeroes animation-duration globally.

export function Skeleton({
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} className={`block animate-pulse rounded bg-slate-light ${className}`} />;
}

export function StatCardSkeleton() {
  return (
    <Card className="p-4">
      <Skeleton className="mb-6 h-9 w-9 rounded-full" />
      <Skeleton className="h-6 w-10" />
      <Skeleton className="mt-2 h-3 w-24" />
      <Skeleton className="mt-2 h-2.5 w-20" />
    </Card>
  );
}

/** Matches the card chrome around it, so the layout does not jump on arrival. */
export function PanelSkeleton({ rows = 3, height = 0 }: { rows?: number; height?: number }) {
  return (
    <Card>
      <Skeleton className="h-4 w-36" />
      {height > 0 ? (
        <Skeleton className="mt-4 w-full" style={{ height }} />
      ) : (
        <div className="mt-4 space-y-3">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}
    </Card>
  );
}
