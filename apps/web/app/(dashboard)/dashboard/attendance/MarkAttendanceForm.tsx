"use client";

import { useState, useTransition } from "react";
import { markAttendanceAction } from "./actions";
import { Button } from "../../../../components/ui/Button";
import { fieldInputClass } from "../../../../components/ui/Field";
import {
  tableWrapperClass,
  tbodyRowClass,
  tdClass,
  thClass,
  theadRowClass,
} from "../../../../components/ui/styles";

export type RosterRow = {
  studentId: string;
  email: string;
  present: boolean;
  mode: "ONLINE" | "OFFLINE";
  marked: boolean;
};

export function MarkAttendanceForm({
  classroomId,
  liveSessionId,
  roster,
}: {
  classroomId: string;
  liveSessionId: string;
  roster: RosterRow[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await markAttendanceAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  }

  if (roster.length === 0) {
    return <p className="mt-4 text-sm text-slate">No students are enrolled in this classroom yet.</p>;
  }

  return (
    <form action={handleSubmit}>
      <input type="hidden" name="classroomId" value={classroomId} />
      <input type="hidden" name="liveSessionId" value={liveSessionId} />

      <div className={tableWrapperClass}>
        <table className="w-full text-sm">
          <thead>
            <tr className={theadRowClass}>
              <th className={thClass}>Student</th>
              <th className={thClass}>Present</th>
              <th className={thClass}>Mode</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((row) => (
              <tr key={row.studentId} className={tbodyRowClass}>
                <td className={tdClass}>
                  {/* Carries the student even when the checkbox is unchecked —
                      FormData omits unchecked boxes entirely, so without this
                      an absent student would look like "not marked". */}
                  <input type="hidden" name="studentIds" value={row.studentId} />
                  {row.email}
                  {!row.marked && (
                    <span className="ml-2 rounded-full bg-parchment px-2 py-0.5 text-xs text-slate">
                      not marked
                    </span>
                  )}
                </td>
                <td className={tdClass}>
                  <input
                    type="checkbox"
                    name={`present:${row.studentId}`}
                    defaultChecked={row.present}
                    aria-label={`${row.email} present`}
                    className="h-4 w-4 accent-board"
                  />
                </td>
                <td className={tdClass}>
                  <select
                    name={`mode:${row.studentId}`}
                    defaultValue={row.mode}
                    aria-label={`${row.email} attendance mode`}
                    className={`${fieldInputClass} py-1`}
                  >
                    <option value="ONLINE">Online</option>
                    <option value="OFFLINE">In person</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save attendance"}
        </Button>
        {saved && !error && <span className="text-sm text-board">Saved.</span>}
      </div>
      {error && <p className="mt-2 text-sm text-brick">{error}</p>}
    </form>
  );
}
