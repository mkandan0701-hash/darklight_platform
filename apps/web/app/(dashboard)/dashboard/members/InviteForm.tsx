"use client";

import { useState, useTransition } from "react";
import { inviteMember } from "./actions";

export function InviteForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await inviteMember(formData);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input name="email" type="email" required className="rounded border px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Role
        <select name="role" required className="rounded border px-3 py-2">
          <option value="COACH">Coach</option>
          <option value="STUDENT">Student</option>
          <option value="PARENT">Parent</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Timezone (IANA)
        <input
          name="timezone"
          required
          defaultValue="America/New_York"
          className="rounded border px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Sending..." : "Invite"}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
