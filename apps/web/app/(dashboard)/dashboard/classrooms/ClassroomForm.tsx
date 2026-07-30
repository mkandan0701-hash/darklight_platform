"use client";

import { useRef, useState, useTransition } from "react";
import { createClassroomAction } from "./actions";

export function ClassroomForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createClassroomAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex items-end gap-3">
      <label className="flex flex-col gap-1 text-sm">
        New classroom name
        <input name="name" required className="rounded border px-3 py-2" />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Creating..." : "Create"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
