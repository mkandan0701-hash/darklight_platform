import type { HTMLAttributes } from "react";

export const cardClass = "rounded-xl border border-ink/10 bg-white p-6 shadow-sm";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`${cardClass} ${className}`} />;
}
