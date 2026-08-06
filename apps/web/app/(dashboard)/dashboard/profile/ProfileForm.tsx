"use client";

import { useState, useTransition } from "react";
import { updateProfileAction } from "./actions";
import { Field, fieldInputClass } from "../../../../components/ui/Field";
import { Button } from "../../../../components/ui/Button";

export function ProfileForm({
  defaultDisplayName,
  fallbackName,
}: {
  defaultDisplayName: string;
  /** What they're called today if the field is blank — the email local part. */
  fallbackName: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updateProfileAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(true);
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <Field
        label="Display name"
        help={`Leave blank to be shown as "${fallbackName}".`}
      >
        <input
          name="displayName"
          defaultValue={defaultDisplayName}
          placeholder={fallbackName}
          maxLength={80}
          className={fieldInputClass}
        />
      </Field>
      {error && <p className="text-sm text-brick">{error}</p>}
      {success && <p className="text-sm font-medium text-board-dark">Saved.</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
