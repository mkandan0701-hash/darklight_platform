import type { ButtonHTMLAttributes } from "react";

const VARIANT_CLASSES = {
  primary:
    "bg-board text-white hover:bg-board-dark disabled:hover:bg-board",
  secondary:
    "border border-ink/20 bg-white text-ink hover:bg-ink/5",
  destructive:
    "border border-brick/30 bg-white text-brick hover:bg-brick/10",
  ghost: "text-slate hover:text-ink",
} as const;

export type ButtonVariant = keyof typeof VARIANT_CLASSES;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
    />
  );
}
