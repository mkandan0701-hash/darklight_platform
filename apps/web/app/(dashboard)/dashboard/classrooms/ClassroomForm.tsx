"use client";

import { useRef, useState, useTransition } from "react";
import { createClassroomAction } from "./actions";
import { Field, fieldInputClass } from "../../../../components/ui/Field";
import { Button } from "../../../../components/ui/Button";

export function ClassroomForm({ onCreated }: { onCreated?: () => void } = {}) {
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
      onCreated?.();
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex flex-wrap items-end gap-3">
      <Field label="New classroom name">
        <input name="name" required className={fieldInputClass} />
      </Field>
      <label className="flex items-center gap-2 pb-2 text-sm text-ink">
        <input type="checkbox" name="weekendFirst" defaultChecked className="h-4 w-4" />
        Weekend-first scheduling
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create classroom"}
      </Button>
      {error && <p className="w-full text-sm text-brick">{error}</p>}
    </form>
  );
}
