import type { ReactNode } from "react";

/** The page's one h1, plus a sentence of context underneath. */
export function AuthHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
        {title}
      </h1>
      {children && <div className="mt-3 text-base leading-relaxed text-slate">{children}</div>}
    </div>
  );
}
