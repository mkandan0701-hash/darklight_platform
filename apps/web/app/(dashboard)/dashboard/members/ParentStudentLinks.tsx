"use client";

import { useState, useTransition } from "react";
import { linkParentStudent, unlinkParentStudent } from "./actions";
import { Field, fieldInputClass } from "../../../../components/ui/Field";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { sectionHeadingClass } from "../../../../components/ui/styles";

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
    <Card>
      <h2 className={sectionHeadingClass}>Parent-student links</h2>

      {parents.length === 0 || students.length === 0 ? (
        <p className="mt-2 text-sm text-slate">
          Invite at least one parent and one student before linking them.
        </p>
      ) : (
        <form action={handleLink} className="mt-3 flex flex-wrap items-end gap-3">
          <Field label="Parent">
            <select name="parentProfileId" required className={fieldInputClass}>
              {parents.map((parent) => (
                <option key={parent.profileId} value={parent.profileId}>
                  {parent.email}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Student">
            <select name="studentProfileId" required className={fieldInputClass}>
              {students.map((student) => (
                <option key={student.profileId} value={student.profileId}>
                  {student.email}
                </option>
              ))}
            </select>
          </Field>
          <Button type="submit" variant="secondary" disabled={pending}>
            Link
          </Button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-brick">{error}</p>}

      {links.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm">
          {links.map((link) => (
            <li key={link.id} className="flex items-center justify-between gap-3 rounded-lg bg-parchment px-3 py-2">
              <span className="text-ink">
                {link.parentEmail} <span className="text-slate">→</span> {link.studentEmail}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => handleUnlink(link.id)}
                className="text-sm font-medium text-brick hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
