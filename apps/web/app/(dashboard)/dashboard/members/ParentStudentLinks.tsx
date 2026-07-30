"use client";

import { useState, useTransition } from "react";
import { linkParentStudent, unlinkParentStudent } from "./actions";

type Member = { profileId: string; email: string };
type Link = { id: string; parentEmail: string; studentEmail: string };

export function ParentStudentLinks({
  parents,
  students,
  links,
}: {
  parents: Member[];
  students: Member[];
  links: Link[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleLink(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await linkParentStudent(formData);
      if (!result.ok) setError(result.error);
    });
  }

  function handleUnlink(linkId: string) {
    setError(null);
    startTransition(async () => {
      const result = await unlinkParentStudent(linkId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div>
      <h2 className="text-sm font-semibold">Parent-student links</h2>

      {parents.length === 0 || students.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">
          Invite at least one parent and one student before linking them.
        </p>
      ) : (
        <form action={handleLink} className="mt-2 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Parent
            <select name="parentProfileId" required className="rounded border px-3 py-2">
              {parents.map((parent) => (
                <option key={parent.profileId} value={parent.profileId}>
                  {parent.email}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Student
            <select name="studentProfileId" required className="rounded border px-3 py-2">
              {students.map((student) => (
                <option key={student.profileId} value={student.profileId}>
                  {student.email}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            Link
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {links.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm">
          {links.map((link) => (
            <li key={link.id} className="flex items-center gap-3">
              <span>
                {link.parentEmail} → {link.studentEmail}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => handleUnlink(link.id)}
                className="text-red-600 underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
