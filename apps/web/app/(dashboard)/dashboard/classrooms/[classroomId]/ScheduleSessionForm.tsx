"use client";

import { useRef, useState, useTransition } from "react";
import { scheduleSessionAction } from "../actions";

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
      <label className="flex flex-col gap-1 text-sm">
        Date &amp; time (your timezone)
        <input
          name="localDateTime"
          type="datetime-local"
          required
          defaultValue={defaultLocalDateTime}
          className="rounded border px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Duration (mins)
        <input
          name="durationMins"
          type="number"
          min={15}
          max={240}
          defaultValue={60}
          required
          className="w-24 rounded border px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Scheduling..." : "Schedule"}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
