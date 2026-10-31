"use client";

import { useRef, useState, useTransition } from "react";
import { setPassword } from "../../../lib/auth/actions";
import { checkPasswordPair } from "../../../lib/auth/passwordRules";
import { Field, fieldDescribedBy } from "../../../components/ui/Field";
import { PasswordField } from "../../../components/ui/PasswordField";
import { Button } from "../../../components/ui/Button";
import { AuthAlert } from "../../../components/auth/AuthAlert";
import { PasswordStrengthMeter } from "../../../components/auth/PasswordStrengthMeter";

const PASSWORD_ID = "new-password";
const CONFIRM_ID = "confirm-password";

export function SetPasswordForm({ email }: { email: string }) {
  const [password, setPasswordValue] = useState("");
  const [confirm, setConfirm] = useState("");
  // Errors appear once a field has been left (or on submit), never while the
  // child is still typing their first few characters.
  const [touched, setTouched] = useState({ password: false, confirm: false });
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // useTransition's `pending` lags the click by a render; this closes the gap
  // a fast double-click would otherwise slip through.
  const inFlight = useRef(false);

  const errors = checkPasswordPair(password, confirm);
  const passwordError = touched.password ? errors.password : undefined;
  const confirmError = touched.confirm ? errors.confirmPassword : undefined;

  function handleSubmit(formData: FormData) {
    if (inFlight.current) return;
    setServerError(null);
    setTouched({ password: true, confirm: true });

    // A courtesy pre-check so the child isn't sent round-trip for a typo.
    // setPassword() re-validates everything with the same rules.
    if (errors.password || errors.confirmPassword) {
      document.getElementById(errors.password ? PASSWORD_ID : CONFIRM_ID)?.focus();
      return;
    }

    inFlight.current = true;
    startTransition(async () => {
      try {
        const result = await setPassword(formData);
        // `setPassword` redirects on success, so reaching here means it failed.
        if (result && !result.ok) {
          setServerError(result.error);
        }
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    // noValidate: the browser's own minLength bubble would race the inline
    // message below and says less. The server action is the real check.
    <form action={handleSubmit} noValidate className="flex flex-col gap-5">
      {/* Tells password managers which account this password belongs to.
          No `name`, so it is never posted. */}
      <input
        type="email"
        autoComplete="username"
        value={email}
        readOnly
        hidden
      />

      <Field
        id={PASSWORD_ID}
        label="New password"
        error={passwordError}
        help={<PasswordStrengthMeter password={password} />}
      >
        <PasswordField
          id={PASSWORD_ID}
          name="password"
          required
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={(e) => setPasswordValue(e.target.value)}
          onBlur={() => password && setTouched((t) => ({ ...t, password: true }))}
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={fieldDescribedBy(PASSWORD_ID, { error: passwordError, help: true })}
        />
      </Field>

      <Field id={CONFIRM_ID} label="Confirm password" error={confirmError}>
        <PasswordField
          id={CONFIRM_ID}
          name="confirmPassword"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onBlur={() => confirm && setTouched((t) => ({ ...t, confirm: true }))}
          aria-invalid={confirmError ? true : undefined}
          aria-describedby={fieldDescribedBy(CONFIRM_ID, { error: confirmError })}
        />
      </Field>

      {serverError && <AuthAlert>{serverError}</AuthAlert>}

      <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">
        {pending ? "Saving your password…" : "Save password and continue"}
      </Button>
    </form>
  );
}
