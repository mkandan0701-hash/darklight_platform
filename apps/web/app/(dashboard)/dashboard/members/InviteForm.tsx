"use client";

import { useState, useTransition } from "react";
import { inviteMember } from "./actions";
import { Field, fieldInputClass } from "../../../../components/ui/Field";
import { Button } from "../../../../components/ui/Button";

export function InviteForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await inviteMember(formData);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-wrap items-end gap-3">
      <Field label="Email">
        <input name="email" type="email" required className={fieldInputClass} />
      </Field>
      <Field label="Role">
        <select name="role" required className={fieldInputClass}>
          <option value="COACH">Coach</option>
          <option value="STUDENT">Student</option>
          <option value="PARENT">Parent</option>
        </select>
      </Field>
      <Field label="Timezone (IANA)">
        <input
          name="timezone"
          required
          defaultValue="America/New_York"
          className={fieldInputClass}
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send invite"}
      </Button>
      {error && <p className="w-full text-sm text-brick">{error}</p>}
    </form>
  );
}
