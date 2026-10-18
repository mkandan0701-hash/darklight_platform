"use client";

import { useState, useTransition } from "react";
import { removeScheduleSlotAction } from "../actions";

export function RemoveScheduleSlotButton({
  classroomId,
  scheduleSlotId,
}: {
  classroomId: string;
  scheduleSlotId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  // Removing a template doesn't cancel classes already put on the calendar
  // from it, but it's still a standing change to the classroom's rhythm — the
  // same one-click-confirm pattern as CancelSessionButton.
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("classroomId", classroomId);
      formData.set("scheduleSlotId", scheduleSlotId);
      const result = await removeScheduleSlotAction(formData);
      if (!result.ok) {
        setError(result.error);
        setConfirming(false);
      }
    });
  }

  if (error) {
    return <span className="text-xs text-brick">{error}</span>;
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs text-slate underline underline-offset-2 hover:text-ink"
      >
        Remove
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-xs">
      <span className="text-slate">Remove this slot?</span>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="font-medium text-brick underline underline-offset-2 disabled:opacity-60"
      >
        {pending ? "Removing…" : "Yes"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="text-slate underline underline-offset-2 hover:text-ink"
      >
        No
      </button>
    </span>
  );
}
