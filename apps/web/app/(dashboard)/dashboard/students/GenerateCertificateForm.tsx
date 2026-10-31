"use client";

import { useRef, useState, useTransition } from "react";
import { generateCertificateAction } from "./actions";
import { Field, fieldInputClass } from "../../../../components/ui/Field";
import { Button } from "../../../../components/ui/Button";

type CertificateType = "ATTENDANCE" | "RATING_MILESTONE" | "TOURNAMENT_RESULT";

export function GenerateCertificateForm({
  students,
}: {
  students: { id: string; label: string }[];
}) {
  const [type, setType] = useState<CertificateType>("ATTENDANCE");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await generateCertificateAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
      setType("ATTENDANCE");
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
      <Field label="Certificate">
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as CertificateType)}
          className={fieldInputClass}
        >
          <option value="ATTENDANCE">Attendance</option>
          <option value="RATING_MILESTONE">Rating achievement</option>
          <option value="TOURNAMENT_RESULT">Tournament result</option>
        </select>
      </Field>

      {/* Attendance and rating certificates derive their content server-side;
          only a tournament result has nothing to derive it from. */}
      {type === "RATING_MILESTONE" && (
        <Field label="Federation" className="w-28">
          <select name="federation" defaultValue="FIDE" className={fieldInputClass}>
            <option value="FIDE">FIDE</option>
            <option value="USCF">USCF</option>
            <option value="ECF">ECF</option>
          </select>
        </Field>
      )}

      {type === "TOURNAMENT_RESULT" && (
        <>
          <Field label="Event">
            <input name="eventName" required maxLength={200} className={fieldInputClass} />
          </Field>
          <Field label="Result">
            <input
              name="eventResult"
              required
              maxLength={200}
              placeholder="2nd place, U1400"
              className={fieldInputClass}
            />
          </Field>
          <Field label="Event date">
            <input name="eventLocalDate" type="date" required className={fieldInputClass} />
          </Field>
        </>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Generating…" : "Generate certificate"}
      </Button>
      {error && <p className="w-full text-sm text-brick">{error}</p>}
    </form>
  );
}
