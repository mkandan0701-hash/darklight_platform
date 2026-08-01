"use client";

import { useRef, useState, useTransition } from "react";
import { Chessboard } from "react-chessboard";
import { createAssignmentAction } from "./actions";
import { Field, fieldInputClass } from "../../../../components/ui/Field";
import { Button } from "../../../../components/ui/Button";
import { cardClass } from "../../../../components/ui/Card";
import { sectionHeadingClass } from "../../../../components/ui/styles";

type PickablePuzzle = {
  id: string;
  fen: string;
  rating: number | null;
  source: string;
};

export function AssignmentForm({
  classrooms,
  puzzles,
}: {
  classrooms: { id: string; name: string }[];
  puzzles: PickablePuzzle[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createAssignmentAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
    });
  }

  if (classrooms.length === 0) {
    return (
      <p className="text-sm text-slate">You aren&apos;t assigned to any classroom yet.</p>
    );
  }

  return (
    <form ref={formRef} action={handleSubmit} className={cardClass}>
      <h2 className={sectionHeadingClass}>New assignment</h2>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Field label="Classroom">
          <select name="classroomId" required className={fieldInputClass}>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title">
          <input name="title" required className={fieldInputClass} />
        </Field>
        <Field label="Due (your timezone, optional)">
          <input name="dueLocalDateTime" type="datetime-local" className={fieldInputClass} />
        </Field>
      </div>

      <p className="mt-5 text-sm font-medium text-ink">Pick puzzles</p>
      {puzzles.length === 0 && (
        <p className="mt-1 text-sm text-slate">No puzzles match this rating range yet.</p>
      )}
      <div className="mt-2 flex max-h-96 flex-wrap gap-4 overflow-y-auto">
        {puzzles.map((puzzle) => (
          <label
            key={puzzle.id}
            className="w-40 cursor-pointer rounded-lg border border-transparent p-2 text-xs has-[:checked]:border-board has-[:checked]:bg-board-light"
          >
            <input type="checkbox" name="puzzleIds" value={puzzle.id} className="mb-1" />
            <div style={{ width: 152 }}>
              <Chessboard position={puzzle.fen} arePiecesDraggable={false} boardWidth={152} />
            </div>
            <p className="mt-1 font-mono text-slate">
              {puzzle.rating ?? "—"} · {puzzle.source === "UPLOAD" ? "your upload" : "Lichess"}
            </p>
          </label>
        ))}
      </div>

      <Button type="submit" disabled={pending} className="mt-4">
        {pending ? "Creating…" : "Create assignment"}
      </Button>
      {error && <p className="mt-2 text-sm text-brick">{error}</p>}
    </form>
  );
}
