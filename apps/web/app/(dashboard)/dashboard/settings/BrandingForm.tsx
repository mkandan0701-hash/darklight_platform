"use client";

import { useState, useTransition } from "react";
import { updateBrandingAction } from "./actions";

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
    <form action={handleSubmit} className="flex max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Logo URL
        <input
          name="logoUrl"
          defaultValue={defaultLogoUrl}
          className="rounded border px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Brand color
        <input
          name="brandColor"
          type="text"
          defaultValue={defaultBrandColor}
          placeholder="#1a1a1a"
          className="rounded border px-3 py-2"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">Saved.</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Saving..." : "Save branding"}
      </button>
    </form>
  );
}
