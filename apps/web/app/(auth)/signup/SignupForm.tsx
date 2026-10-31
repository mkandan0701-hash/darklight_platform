"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signUpAcademy } from "../../../lib/auth/actions";
import { Field, fieldDescribedBy, fieldInputLgClass } from "../../../components/ui/Field";
import { PasswordField } from "../../../components/ui/PasswordField";
import { Button } from "../../../components/ui/Button";
import { AuthAlert } from "../../../components/auth/AuthAlert";
import { PasswordStrengthMeter } from "../../../components/auth/PasswordStrengthMeter";
import { MIN_PASSWORD_LENGTH } from "../../../lib/auth/passwordRules";

export function SignupForm() {
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await signUpAcademy(formData);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push("/login");
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-5">
      <Field id="academyName" label="Academy name">
        <input
          id="academyName"
          name="academyName"
          required
          autoComplete="organization"
          className={fieldInputLgClass}
        />
      </Field>
      <Field id="subdomain" label="Subdomain" help="Lowercase letters, numbers, and hyphens only.">
        <input
          id="subdomain"
          name="subdomain"
          required
          placeholder="my-academy"
          pattern="[a-z0-9-]+"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby="subdomain-help"
          className={fieldInputLgClass}
        />
      </Field>
      <Field id="timezone" label="Timezone (IANA)" help="e.g. Asia/Kolkata, America/New_York">
        <input
          id="timezone"
          name="timezone"
          required
          defaultValue="Asia/Kolkata"
          autoCapitalize="none"
          spellCheck={false}
          aria-describedby="timezone-help"
          className={fieldInputLgClass}
        />
      </Field>
      <Field
        id="adminName"
        label="Your name"
        help="Optional — shown to your coaches, students and parents."
      >
        <input
          id="adminName"
          name="adminName"
          autoComplete="name"
          aria-describedby="adminName-help"
          className={fieldInputLgClass}
        />
      </Field>
      <Field id="adminEmail" label="Admin email">
        <input
          id="adminEmail"
          name="adminEmail"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          className={fieldInputLgClass}
        />
      </Field>
      <Field
        id="adminPassword"
        label="Admin password"
        help={<PasswordStrengthMeter password={password} />}
      >
        <PasswordField
          id="adminPassword"
          name="adminPassword"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby={fieldDescribedBy("adminPassword", { help: true })}
        />
      </Field>
      {error && <AuthAlert>{error}</AuthAlert>}
      <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">
        {pending ? "Creating academy…" : "Create academy"}
      </Button>
    </form>
  );
}
