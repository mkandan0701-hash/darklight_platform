"use client";

import { useState, useTransition } from "react";
import { assignCoachAction, enrollStudentAction } from "../actions";

export function RosterForms({ classroomId }: { classroomId: string }) {
  const [coachError, setCoachError] = useState<string | null>(null);
  const [studentError, setStudentError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAssignCoach(formData: FormData) {
    setCoachError(null);
    startTransition(async () => {
      const result = await assignCoachAction(formData);
      if (!result.ok) setCoachError(result.error);
    });
  }

  function handleEnrollStudent(formData: FormData) {
    setStudentError(null);
    startTransition(async () => {
      const result = await enrollStudentAction(formData);
      if (!result.ok) setStudentError(result.error);
    });
  }

  return (
    <div className="mt-8 flex flex-col gap-6">
      <form action={handleAssignCoach} className="flex items-end gap-3">
        <input type="hidden" name="classroomId" value={classroomId} />
        <label className="flex flex-col gap-1 text-sm">
          Assign coach (CoachProfile id)
          <input name="profileId" required className="rounded border px-3 py-2" />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          Assign
        </button>
        {coachError && <p className="text-sm text-red-600">{coachError}</p>}
      </form>

      <form action={handleEnrollStudent} className="flex items-end gap-3">
        <input type="hidden" name="classroomId" value={classroomId} />
        <label className="flex flex-col gap-1 text-sm">
          Enroll student (StudentProfile id)
          <input name="profileId" required className="rounded border px-3 py-2" />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          Enroll
        </button>
        {studentError && <p className="text-sm text-red-600">{studentError}</p>}
      </form>
    </div>
  );
}
