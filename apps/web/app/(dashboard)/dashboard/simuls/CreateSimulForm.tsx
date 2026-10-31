"use client";

import { useRef, useState, useTransition } from "react";
import { createSimulAction } from "./actions";
import { Field, fieldInputClass } from "../../../../components/ui/Field";
import { Button } from "../../../../components/ui/Button";

export function CreateSimulForm({
  students,
  defaultStart,
}: {
  students: { id: string; label: string }[];
  defaultStart: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createSimulAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex flex-col gap-4">
      <Field label="Starts (your timezone)" className="max-w-xs">
        <input
          name="startsLocal"
          type="datetime-local"
          required
          defaultValue={defaultStart}
          className={fieldInputClass}
        />
      </Field>

      <fieldset>
        <legend className="text-xs uppercase tracking-wide text-slate">
          Opponents — one board each
        </legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {students.map((student) => (
            <label key={student.id} className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="studentIds" value={student.id} className="h-4 w-4" />
              {student.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create simul"}
        </Button>
      </div>
      {error && <p className="text-sm text-brick">{error}</p>}
    </form>
  );
}
