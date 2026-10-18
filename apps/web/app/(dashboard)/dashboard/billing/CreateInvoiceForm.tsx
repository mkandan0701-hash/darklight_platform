"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { createInvoiceAction } from "./actions";
import { Field, fieldInputClass } from "../../../../components/ui/Field";
import { Button } from "../../../../components/ui/Button";

export function CreateInvoiceForm({
  students,
}: {
  students: { id: string; label: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  // One id per mount, resubmitted verbatim on every attempt while pending —
  // this is what makes a double-click safe on the Stripe side (see
  // createInvoiceAction). Not regenerated on error, since a retry after a
  // provider failure should still land on the same idempotency key.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createInvoiceAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
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
      <Field label="Description">
        <input name="description" required maxLength={200} className={fieldInputClass} />
      </Field>
      <Field label="Amount" className="w-28">
        <input
          name="amountMajorUnits"
          type="number"
          min={0.01}
          step={0.01}
          required
          className={fieldInputClass}
        />
      </Field>
      <Field label="Currency" className="w-24">
        <select name="currency" defaultValue="USD" className={fieldInputClass}>
          <option value="USD">USD</option>
          <option value="INR">INR</option>
        </select>
      </Field>
      <Field label="Due date">
        <input name="dueLocalDate" type="date" required className={fieldInputClass} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create invoice"}
      </Button>
      {error && <p className="w-full text-sm text-brick">{error}</p>}
    </form>
  );
}
