"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signUpAcademy } from "../../../lib/auth/actions";
import { Field, fieldInputClass } from "../../../components/ui/Field";
import { Button } from "../../../components/ui/Button";

export function SignupForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await signUpAcademy(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/login");
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <Field label="Academy name">
        <input name="academyName" required className={fieldInputClass} />
      </Field>
      <Field label="Subdomain" help="Lowercase letters, numbers, and hyphens only.">
        <input
          name="subdomain"
          required
          placeholder="my-academy"
          pattern="[a-z0-9-]+"
          className={fieldInputClass}
        />
      </Field>
      <Field label="Timezone (IANA)" help="e.g. Asia/Kolkata, America/New_York">
        <input name="timezone" required defaultValue="Asia/Kolkata" className={fieldInputClass} />
      </Field>
      <Field label="Your name" help="Optional — shown to your coaches, students and parents.">
        <input name="adminName" className={fieldInputClass} />
      </Field>
      <Field label="Admin email">
        <input name="adminEmail" type="email" required className={fieldInputClass} />
      </Field>
      <Field label="Admin password" help="At least 8 characters.">
        <input
          name="adminPassword"
          type="password"
          required
          minLength={8}
          className={fieldInputClass}
        />
      </Field>
      {error && (
        <p role="alert" className="rounded-lg bg-brick-light px-3 py-2 text-sm text-brick">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="mt-1 w-full">
        {pending ? "Creating academy…" : "Create academy"}
      </Button>
    </form>
  );
}
