"use client";

import { useState, useTransition } from "react";
import { setPassword } from "../../../lib/auth/actions";
import { Field, fieldInputClass } from "../../../components/ui/Field";
import { Button } from "../../../components/ui/Button";

export function SetPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await setPassword(formData);
      // `setPassword` redirects on success, so reaching here means it failed.
      if (result && !result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <Field label="New password" help="At least 8 characters.">
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={fieldInputClass}
        />
      </Field>
      <Field label="Confirm password">
        <input
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={fieldInputClass}
        />
      </Field>
      {error && (
        <p role="alert" className="rounded-lg bg-brick-light px-3 py-2 text-sm text-brick">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="mt-1 w-full">
        {pending ? "Saving…" : "Save password and continue"}
      </Button>
    </form>
  );
}
