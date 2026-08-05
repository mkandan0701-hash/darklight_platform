"use client";

import { useState, useTransition } from "react";
import { cancelSessionAction } from "../actions";

export function CancelSessionButton({
  classroomId,
  liveSessionId,
}: {
  classroomId: string;
  liveSessionId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  // Cancelling is one-way and visible to every student and parent in the room,
  // so it asks once rather than acting on a stray click in a list of rows.
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function cancel() {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("classroomId", classroomId);
      formData.set("liveSessionId", liveSessionId);
      const result = await cancelSessionAction(formData);
      if (!result.ok) {
        setError(result.error);
        setConfirming(false);
      }
      // On success the action revalidates this path and the row disappears —
      // no local state to reset.
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
        Cancel
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-xs">
      <span className="text-slate">Cancel this class?</span>
      <button
        type="button"
        onClick={cancel}
        disabled={pending}
        className="font-medium text-brick underline underline-offset-2 disabled:opacity-60"
      >
        {pending ? "Cancelling…" : "Yes"}
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
