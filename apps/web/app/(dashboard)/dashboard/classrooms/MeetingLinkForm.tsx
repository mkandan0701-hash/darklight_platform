"use client";

import { useState, useTransition } from "react";
import { setMeetingUrlAction } from "./actions";
import { Field, fieldInputClass } from "../../../../components/ui/Field";
import { Button } from "../../../../components/ui/Button";

/**
 * Pasted video link for a classroom, or for one session when liveSessionId is
 * given. Google Meet is the expected case — a Meet link doesn't expire, so a
 * room's one link serves every weekly class.
 */
export function MeetingLinkForm({
  classroomId,
  liveSessionId,
  currentUrl,
}: {
  classroomId: string;
  liveSessionId?: string;
  currentUrl: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    formData.set("classroomId", classroomId);
    if (liveSessionId) formData.set("liveSessionId", liveSessionId);
    startTransition(async () => {
      const result = await setMeetingUrlAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-wrap items-end gap-3">
      <Field
        label={liveSessionId ? "Meeting link for this class only" : "Meeting link"}
        help={
          liveSessionId
            ? "Leave empty to use the classroom's link."
            : "Paste a Google Meet, Zoom or Teams link. Students see a Join button on every class."
        }
        className="min-w-[16rem] flex-1"
      >
        <input
          name="meetingUrl"
          type="url"
          inputMode="url"
          defaultValue={currentUrl ?? ""}
          placeholder="https://meet.google.com/abc-defg-hij"
          className={fieldInputClass}
        />
      </Field>
      <Button type="submit" variant="secondary" disabled={pending} className="mb-6">
        {pending ? "Saving…" : "Save link"}
      </Button>
      {error && <p className="w-full text-sm text-brick">{error}</p>}
      {saved && !error && <p className="w-full text-sm text-board">Saved.</p>}
    </form>
  );
}
