"use client";

import { useRef, useState, useTransition } from "react";
import { recordRatingAction } from "./actions";
import { Field, fieldInputClass } from "../../../../components/ui/Field";
import { Button } from "../../../../components/ui/Button";

export function RecordRatingForm({
  students,
}: {
  students: { id: string; label: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await recordRatingAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex flex-wrap items-end gap-3">
      <Field label="Student">
        <select name="studentId" required defaultValue="" className={fieldInputClass}>
          <option value="" disabled>
            Choose a student
          </option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Federation" className="w-28">
        <select name="federation" defaultValue="FIDE" className={fieldInputClass}>
          <option value="FIDE">FIDE</option>
          <option value="USCF">USCF</option>
          <option value="ECF">ECF</option>
        </select>
      </Field>
      <Field label="Rating" className="w-28">
        <input name="rating" type="number" min={1} max={3500} required className={fieldInputClass} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Recording…" : "Record rating"}
      </Button>
      {error && <p className="w-full text-sm text-brick">{error}</p>}
    </form>
  );
}
