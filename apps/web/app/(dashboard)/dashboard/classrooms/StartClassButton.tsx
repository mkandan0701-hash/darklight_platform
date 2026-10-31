"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startSessionAction } from "./actions";
import { Button } from "../../../../components/ui/Button";

export function StartClassButton({
  classroomId,
  liveSessionId,
  label = "Start Classroom",
}: {
  classroomId: string;
  liveSessionId: string;
  label?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function start() {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("classroomId", classroomId);
      formData.set("liveSessionId", liveSessionId);
      const result = await startSessionAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(result.href);
      // Starting from the session page itself pushes to the same URL, which
      // wouldn't re-render the server component without this.
      router.refresh();
    });
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <Button type="button" onClick={start} disabled={pending} className="py-2">
        {pending ? "Starting…" : label}
      </Button>
      {error && <span className="max-w-[16rem] text-right text-xs text-brick">{error}</span>}
    </span>
  );
}
