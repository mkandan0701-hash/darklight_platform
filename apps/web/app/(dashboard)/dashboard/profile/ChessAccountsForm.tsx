"use client";

import { useState, useTransition } from "react";
import { updateChessAccountsAction } from "./actions";
import { Field, fieldInputClass } from "../../../../components/ui/Field";
import { Button } from "../../../../components/ui/Button";

export function ChessAccountsForm({
  defaults,
}: {
  defaults: {
    lichessHandle: string;
    chesscomHandle: string;
    fideId: string;
    uscfId: string;
    eclId: string;
  };
}) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updateChessAccountsAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(true);
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <Field
        label="Lichess username"
        help="Your games are imported here automatically each night."
      >
        <input
          name="lichessHandle"
          defaultValue={defaults.lichessHandle}
          maxLength={60}
          className={fieldInputClass}
        />
      </Field>
      <Field label="Chess.com username">
        <input
          name="chesscomHandle"
          defaultValue={defaults.chesscomHandle}
          maxLength={60}
          className={fieldInputClass}
        />
      </Field>
      <Field label="FIDE ID" help="Printed on rating certificates, when set.">
        <input
          name="fideId"
          defaultValue={defaults.fideId}
          maxLength={30}
          className={fieldInputClass}
        />
      </Field>
      <Field label="US Chess ID">
        <input
          name="uscfId"
          defaultValue={defaults.uscfId}
          maxLength={30}
          className={fieldInputClass}
        />
      </Field>
      <Field label="ECF ID">
        <input
          name="eclId"
          defaultValue={defaults.eclId}
          maxLength={30}
          className={fieldInputClass}
        />
      </Field>
      {error && <p className="text-sm text-brick">{error}</p>}
      {success && <p className="text-sm font-medium text-board-dark">Saved.</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save chess accounts"}
      </Button>
    </form>
  );
}
