"use client";

import { useRef, useState, useTransition } from "react";
import { scheduleSessionAction } from "../actions";
import { Field, fieldInputClass } from "../../../../../components/ui/Field";
import { Button } from "../../../../../components/ui/Button";

export function ScheduleSessionForm({
  classroomId,
  defaultLocalDateTime,
}: {
  classroomId: string;
  defaultLocalDateTime: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await scheduleSessionAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="classroomId" value={classroomId} />
      <Field label="Date & time (your timezone)">
        <input
          name="localDateTime"
          type="datetime-local"
          required
          defaultValue={defaultLocalDateTime}
          className={fieldInputClass}
        />
      </Field>
      <Field label="Duration (mins)" className="w-28">
        <input
          name="durationMins"
          type="number"
          min={15}
          max={240}
          defaultValue={60}
          required
          className={fieldInputClass}
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Scheduling…" : "Schedule session"}
      </Button>
      {error && <p className="w-full text-sm text-brick">{error}</p>}
    </form>
  );
}
