"use client";

import { useState, useTransition } from "react";
import { updateBrandingAction } from "./actions";
import { Field, fieldInputClass } from "../../../../components/ui/Field";
import { Button } from "../../../../components/ui/Button";

export function BrandingForm({
  defaultLogoUrl,
  defaultBrandColor,
}: {
  defaultLogoUrl: string;
  defaultBrandColor: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updateBrandingAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(true);
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <Field label="Logo URL" help="A direct link to an image file.">
        <input name="logoUrl" defaultValue={defaultLogoUrl} className={fieldInputClass} />
      </Field>
      <Field label="Brand color">
        <input
          name="brandColor"
          type="text"
          defaultValue={defaultBrandColor}
          placeholder="#1F6D4C"
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
