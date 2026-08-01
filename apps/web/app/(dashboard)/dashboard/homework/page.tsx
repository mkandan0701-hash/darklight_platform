import Link from "next/link";
import { getCurrentSession } from "../../../../lib/auth/session";
import { requireRole } from "../../../../lib/auth/requireRole";
import { formatInZone } from "../../../../lib/time";
import { listClassrooms } from "../../../../repositories/classroomRepository";
import { listAssignablePuzzles } from "../../../../repositories/puzzleRepository";
import { getStudentProfileByUserId } from "../../../../repositories/userRepository";
import {
  listAssignmentsForClassroom,
  listAssignmentsForStudent,
} from "../../../../repositories/assignmentRepository";
import { AssignmentForm } from "./AssignmentForm";
import { Card } from "../../../../components/ui/Card";
import { Button } from "../../../../components/ui/Button";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { Field, fieldInputClass } from "../../../../components/ui/Field";
import { pageHeadingClass, sectionHeadingClass, textLinkClass } from "../../../../components/ui/styles";

export default async function HomeworkPage({
  searchParams,
}: {
  searchParams: { ratingMin?: string; ratingMax?: string };
}) {
  const session = await getCurrentSession();

  if (session.role === "STUDENT") {
    const studentProfile = await getStudentProfileByUserId(session.tenantId, session.id);
    const assignments = studentProfile
      ? await listAssignmentsForStudent(session.tenantId, studentProfile.id)
      : [];

    return (
      <div>
        <h1 className={pageHeadingClass}>Homework</h1>
        {assignments.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="No homework assigned yet"
              description="Once your coach assigns puzzles, they'll show up here with a due date in your own time zone."
            />
          </div>
        ) : (
          <ul className="mt-6 space-y-2">
            {assignments.map((assignment) => (
              <Card key={assignment.id} className="flex items-center justify-between p-4">
                <Link href={`/dashboard/homework/${assignment.id}`} className={textLinkClass}>
                  {assignment.title}
                </Link>
                <span className="text-xs text-slate">
                  {assignment.classroom.name} · {assignment.puzzles.length} puzzles
                  {assignment.dueAtUtc &&
                    ` · due ${formatInZone(assignment.dueAtUtc, session.timezone)}`}
                </span>
              </Card>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const canAssign = (() => {
    try {
      requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
      return true;
    } catch {
      return false;
    }
  })();

  if (!canAssign) {
    // PARENT (or any future role without a homework view) gets an explicit
    // empty state, not an unhandled branch.
    return (
      <div>
        <h1 className={pageHeadingClass}>Homework</h1>
        <div className="mt-6">
          <EmptyState title="Nothing to show here yet" description="Homework assignments will appear here once your coach sets them up." />
        </div>
      </div>
    );
  }

  const allClassrooms = await listClassrooms(session.tenantId);
  const assignableClassrooms =
    session.role === "ACADEMY_ADMIN"
      ? allClassrooms
      : allClassrooms.filter((c) => c.coaches.some((cc) => cc.coach.user.id === session.id));

  const ratingMin = searchParams.ratingMin ? Number(searchParams.ratingMin) : undefined;
  const ratingMax = searchParams.ratingMax ? Number(searchParams.ratingMax) : undefined;
  const assignablePuzzles = await listAssignablePuzzles(session.tenantId, {
    ratingMin,
    ratingMax,
  });

  const assignmentsByClassroom = await Promise.all(
    assignableClassrooms.map(async (classroom) => ({
      classroom,
      assignments: await listAssignmentsForClassroom(session.tenantId, classroom.id),
    }))
  );

  return (
    <div>
      <h1 className={pageHeadingClass}>Homework</h1>

      <form className="mt-4 flex flex-wrap items-end gap-3" method="get">
        <Field label="Min rating" className="w-28">
          <input
            name="ratingMin"
            type="number"
            defaultValue={searchParams.ratingMin ?? ""}
            className={fieldInputClass}
          />
        </Field>
        <Field label="Max rating" className="w-28">
          <input
            name="ratingMax"
            type="number"
            defaultValue={searchParams.ratingMax ?? ""}
            className={fieldInputClass}
          />
        </Field>
        <Button type="submit" variant="secondary">
          Filter puzzles
        </Button>
      </form>

      <div className="mt-4">
        <AssignmentForm
          classrooms={assignableClassrooms.map((c) => ({ id: c.id, name: c.name }))}
          puzzles={assignablePuzzles.map((p) => ({
            id: p.id,
            fen: p.fen,
            rating: p.rating,
            source: p.source,
          }))}
        />
      </div>

      {assignmentsByClassroom.map(({ classroom, assignments }) => (
        <section key={classroom.id} className="mt-8">
          <h2 className={sectionHeadingClass}>{classroom.name}</h2>
          {assignments.length === 0 ? (
            <p className="mt-2 text-sm text-slate">No assignments yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {assignments.map((assignment) => (
                <Card key={assignment.id} className="flex items-center justify-between p-4">
                  <Link href={`/dashboard/homework/${assignment.id}`} className={textLinkClass}>
                    {assignment.title}
                  </Link>
                  <span className="text-xs text-slate">
                    {assignment.puzzles.length} puzzles
                    {assignment.dueAtUtc &&
                      ` · due ${formatInZone(assignment.dueAtUtc, session.timezone)}`}
                  </span>
                </Card>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
