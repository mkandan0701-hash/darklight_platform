"use client";

import { useRef, useState, useTransition } from "react";
import {
  createTournamentAction,
  generateRoundAction,
  recordResultAction,
  registerParticipantAction,
} from "./actions";
import { Field, fieldInputClass } from "../../../../components/ui/Field";
import { Button } from "../../../../components/ui/Button";

type ActionResult = { ok: true } | { ok: false; error: string };

/** Shared submit plumbing: every form here is "post, show the error, reset". */
function useAction(action: (formData: FormData) => Promise<ActionResult>) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const submit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
    });
  };

  return { error, pending, formRef, submit };
}

export function CreateTournamentForm({ defaultStart }: { defaultStart: string }) {
  const { error, pending, formRef, submit } = useAction(createTournamentAction);

  return (
    <form ref={formRef} action={submit} className="flex flex-wrap items-end gap-3">
      <Field label="Name">
        <input name="name" required maxLength={120} className={fieldInputClass} />
      </Field>
      <Field label="Format" className="w-32">
        <select name="format" defaultValue="SWISS" className={fieldInputClass}>
          <option value="SWISS">Swiss</option>
          <option value="ARENA">Arena</option>
        </select>
      </Field>
      <Field label="Starts (your timezone)">
        <input
          name="startsLocal"
          type="datetime-local"
          required
          defaultValue={defaultStart}
          className={fieldInputClass}
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create tournament"}
      </Button>
      {error && <p className="w-full text-sm text-brick">{error}</p>}
    </form>
  );
}

export function RegisterPlayerForm({
  tournamentId,
  students,
}: {
  tournamentId: string;
  students: { id: string; label: string }[];
}) {
  const { error, pending, formRef, submit } = useAction(registerParticipantAction);

  return (
    <form ref={formRef} action={submit} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <Field label="Add player">
        <select name="studentId" required defaultValue="" className={fieldInputClass}>
          <option value="" disabled>
            Choose a student
          </option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Enter player"}
      </Button>
      {error && <p className="w-full text-sm text-brick">{error}</p>}
    </form>
  );
}

export function GenerateRoundButton({ tournamentId }: { tournamentId: string }) {
  const { error, pending, submit } = useAction(generateRoundAction);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        disabled={pending}
        onClick={() => {
          const formData = new FormData();
          formData.set("tournamentId", tournamentId);
          submit(formData);
        }}
      >
        {pending ? "Pairing…" : "Pair next round"}
      </Button>
      {error && <p className="text-sm text-brick">{error}</p>}
    </div>
  );
}

export function ResultPicker({
  tournamentId,
  pairingId,
  current,
}: {
  tournamentId: string;
  pairingId: string;
  current: string | null;
}) {
  const { error, pending, submit } = useAction(recordResultAction);

  function record(result: string) {
    const formData = new FormData();
    formData.set("tournamentId", tournamentId);
    formData.set("pairingId", pairingId);
    formData.set("result", result);
    submit(formData);
  }

  if (error) return <span className="text-xs text-brick">{error}</span>;

  return (
    <span className="flex items-center gap-1">
      {["1-0", "1/2-1/2", "0-1"].map((result) => (
        <button
          key={result}
          type="button"
          disabled={pending}
          onClick={() => record(result)}
          className={`rounded px-2 py-1 font-mono text-xs disabled:opacity-60 ${
            current === result
              ? "bg-board text-white"
              : "bg-parchment text-slate hover:text-ink"
          }`}
        >
          {result}
        </button>
      ))}
    </span>
  );
}
