"use client";

import { useState, useTransition } from "react";
import { assignCoachAction, enrollStudentAction } from "../actions";
import { Field, fieldInputClass } from "../../../../../components/ui/Field";
import { Button } from "../../../../../components/ui/Button";
import { Card } from "../../../../../components/ui/Card";

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
    <Card className="mt-6 flex flex-col gap-6">
      <form action={handleAssignCoach} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="classroomId" value={classroomId} />
        <Field label="Assign coach" help="Paste the coach's profile ID." className="min-w-[16rem]">
          <input name="profileId" required className={fieldInputClass} />
        </Field>
        <Button type="submit" variant="secondary" disabled={pending}>
          Assign
        </Button>
        {coachError && <p className="w-full text-sm text-brick">{coachError}</p>}
      </form>

      <form action={handleEnrollStudent} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="classroomId" value={classroomId} />
        <Field label="Enroll student" help="Paste the student's profile ID." className="min-w-[16rem]">
          <input name="profileId" required className={fieldInputClass} />
        </Field>
        <Button type="submit" variant="secondary" disabled={pending}>
          Enroll
        </Button>
        {studentError && <p className="w-full text-sm text-brick">{studentError}</p>}
      </form>
    </Card>
  );
}
