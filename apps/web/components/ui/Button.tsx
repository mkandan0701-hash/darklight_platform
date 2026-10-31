import type { ButtonHTMLAttributes } from "react";
import { LoaderCircle } from "./icons";

const VARIANT_CLASSES = {
  primary:
    "bg-board text-white hover:bg-board-dark disabled:hover:bg-board",
  secondary:
    "border border-ink/20 bg-white text-ink hover:bg-ink/5",
  destructive:
    "border border-brick/30 bg-white text-brick hover:bg-brick/10",
  ghost: "text-slate hover:text-ink",
} as const;

const SIZE_CLASSES = {
  md: "rounded-lg px-4 py-2.5 text-sm",
  // The auth pages' primary action: 48px tall, matching fieldInputLgClass.
  lg: "h-12 rounded-xl px-5 text-base font-semibold shadow-sm shadow-board/20",
} as const;

export type ButtonVariant = keyof typeof VARIANT_CLASSES;
export type ButtonSize = keyof typeof SIZE_CLASSES;

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Disables the button and shows a spinner beside the (caller-supplied) label. */
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 font-medium transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${loading ? "disabled:opacity-80" : ""} ${className}`}
    >
      {loading && (
        <LoaderCircle
          size={18}
          strokeWidth={2.25}
          className="animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}
