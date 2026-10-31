"use client";

import { useRef, useState, useTransition } from "react";
import { login } from "../../../lib/auth/actions";
import { Field, fieldInputLgClass } from "../../../components/ui/Field";
import { PasswordField } from "../../../components/ui/PasswordField";
import { Button } from "../../../components/ui/Button";
import { AuthAlert } from "../../../components/auth/AuthAlert";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);

  function handleSubmit(formData: FormData) {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await login(formData);
        // `login` redirects on success, so reaching here means it failed.
        if (result && !result.ok) {
          setError(result.error);
        }
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-5">
      <Field id="email" label="Email">
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          className={fieldInputLgClass}
        />
      </Field>
      <Field id="password" label="Password">
        <PasswordField
          id="password"
          name="password"
          required
          autoComplete="current-password"
        />
      </Field>
      {error && <AuthAlert>{error}</AuthAlert>}
      <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
