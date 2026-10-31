"use client";

import { useState, useTransition } from "react";
import { requestGameAnalysisAction } from "./actions";

export function RequestAnalysisButton({ gameId }: { gameId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [pending, startTransition] = useTransition();

  function request() {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("gameId", gameId);
      const result = await requestGameAnalysisAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // The worker writes the result; this page shows it on the next load.
      // Nothing to poll for here — analysis takes minutes, not seconds.
      setQueued(true);
    });
  }

  if (error) return <span className="text-xs text-brick">{error}</span>;
  if (queued) return <span className="text-xs text-slate">Queued</span>;

  return (
    <button
      type="button"
      onClick={request}
      disabled={pending}
      className="text-xs text-slate underline underline-offset-2 hover:text-ink disabled:opacity-60"
    >
      {pending ? "Queueing…" : "Analyse"}
    </button>
  );
}
