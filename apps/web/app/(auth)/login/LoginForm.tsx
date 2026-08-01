"use client";

import { useState, useTransition } from "react";
import { login } from "../../../lib/auth/actions";
import { Field, fieldInputClass } from "../../../components/ui/Field";
import { Button } from "../../../components/ui/Button";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await login(formData);
      // `login` redirects on success, so reaching here means it failed.
      if (result && !result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <Field label="Email">
        <input name="email" type="email" required className={fieldInputClass} />
      </Field>
      <Field label="Password">
        <input name="password" type="password" required className={fieldInputClass} />
      </Field>
      {error && (
        <p role="alert" className="rounded-lg bg-brick-light px-3 py-2 text-sm text-brick">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="mt-1 w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
