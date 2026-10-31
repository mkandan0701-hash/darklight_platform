import { Check } from "../ui/icons";
import { MIN_PASSWORD_LENGTH, passwordStrength } from "../../lib/auth/passwordRules";

const BAR_COLOURS = ["bg-ink/10", "bg-brick", "bg-gold", "bg-board", "bg-board"] as const;
const LABEL_COLOURS = ["text-slate", "text-brick", "text-gold-dark", "text-board", "text-board"] as const;

/**
 * The rule ("at least 8 characters") with a tick once it's met, and an
 * advisory four-step strength bar. Rendered as the Field's help text, so the
 * password input's aria-describedby already points at it.
 *
 * The strength label is announced politely as it changes; the bar itself is
 * decorative — the label says the same thing in words.
 */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const { score, label } = passwordStrength(password);
  const meetsMinimum = password.length >= MIN_PASSWORD_LENGTH;

  return (
    <div className="flex flex-col gap-2">
      <div aria-hidden="true" className="grid grid-cols-4 gap-1.5">
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={`h-1.5 rounded-full transition-colors motion-reduce:transition-none ${
              score >= step ? BAR_COLOURS[score] : "bg-ink/10"
            }`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className={`inline-flex items-center gap-1.5 ${meetsMinimum ? "text-board" : "text-slate"}`}>
          {meetsMinimum && <Check size={16} strokeWidth={2.5} aria-hidden="true" />}
          At least {MIN_PASSWORD_LENGTH} characters
        </span>
        <span aria-live="polite" className={`shrink-0 font-semibold ${LABEL_COLOURS[score]}`}>
          {label && <span className="sr-only">Password strength: </span>}
          {label}
        </span>
      </div>
    </div>
  );
}
