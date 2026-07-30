"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signUpAcademy } from "../../../lib/auth/actions";

export function SignupForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await signUpAcademy(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/login");
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Academy name
        <input name="academyName" required className="rounded border px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Subdomain
        <input
          name="subdomain"
          required
          placeholder="my-academy"
          pattern="[a-z0-9-]+"
          className="rounded border px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Timezone (IANA)
        <input
          name="timezone"
          required
          defaultValue="Asia/Kolkata"
          className="rounded border px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Admin email
        <input name="adminEmail" type="email" required className="rounded border px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Admin password
        <input
          name="adminPassword"
          type="password"
          required
          minLength={8}
          className="rounded border px-3 py-2"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Creating academy..." : "Create academy"}
      </button>
    </form>
  );
}
