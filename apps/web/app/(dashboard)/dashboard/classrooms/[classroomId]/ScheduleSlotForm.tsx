"use client";

import { useRef, useState, useTransition } from "react";
import { addScheduleSlotAction } from "../actions";
import { Field, fieldInputClass } from "../../../../../components/ui/Field";
import { Button } from "../../../../../components/ui/Button";

const DAY_OPTIONS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
];

export function ScheduleSlotForm({
  classroomId,
  timezone,
  weekendFirst,
  hasExistingSlots,
}: {
  classroomId: string;
  timezone: string;
  weekendFirst: boolean;
  hasExistingSlots: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // Weekend-first only shapes the *suggested* default for the first slot a
  // coach adds — it never constrains what they can actually pick.
  const defaultDay = weekendFirst && !hasExistingSlots ? 6 : 1;

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await addScheduleSlotAction(formData);
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
      <input type="hidden" name="timezone" value={timezone} />
      <Field label="Day">
        <select name="dayOfWeek" defaultValue={defaultDay} className={fieldInputClass}>
          {DAY_OPTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Time (your timezone)">
        <input
          name="localTime"
          type="time"
          required
          defaultValue={weekendFirst && !hasExistingSlots ? "10:00" : undefined}
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
        {pending ? "Adding…" : "Add weekly slot"}
      </Button>
      {error && <p className="w-full text-sm text-brick">{error}</p>}
    </form>
  );
}
