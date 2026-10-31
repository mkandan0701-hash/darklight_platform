import type { ReactNode } from "react";
import { CircleAlert, Info } from "../ui/icons";

const TONES = {
  error: {
    className: "border-brick/20 bg-brick-light text-brick",
    Icon: CircleAlert,
    // Interrupts the screen reader: something the person did needs fixing.
    role: "alert",
  },
  info: {
    className: "border-board/20 bg-board-light text-board-dark",
    Icon: Info,
    role: "status",
  },
} as const;

/** The notice banner on the auth pages — form errors and link-problem notices. */
export function AuthAlert({
  tone = "error",
  children,
  className = "",
}: {
  tone?: keyof typeof TONES;
  children: ReactNode;
  className?: string;
}) {
  const { className: toneClass, Icon, role } = TONES[tone];
  return (
    <div
      role={role}
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed ${toneClass} ${className}`}
    >
      <Icon size={18} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
