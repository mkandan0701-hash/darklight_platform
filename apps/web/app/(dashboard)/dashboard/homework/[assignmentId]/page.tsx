import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentSession } from "../../../../../lib/auth/session";
import { requireRole } from "../../../../../lib/auth/requireRole";
import { getStudentProfileByUserId } from "../../../../../repositories/userRepository";
import {
  getAssignmentForViewer,
  getAssignmentCompletionForClassroom,
  getStudentPuzzleStatuses,
} from "../../../../../repositories/assignmentRepository";
import { RankProgressBar } from "../../../../../components/ui/RankProgressBar";
import { Badge, type BadgeTone } from "../../../../../components/ui/Badge";
import {
  pageHeadingClass,
  tableWrapperClass,
  tbodyRowClass,
  tdClass,
  textLinkClass,
  thClass,
  theadRowClass,
} from "../../../../../components/ui/styles";

const STATUS_LABEL: Record<"solved" | "attempted" | "unattempted", string> = {
  solved: "Solved",
  attempted: "Attempted",
  unattempted: "Not started",
};

export default async function AssignmentDetailPage({
  params,
}: {
  params: { assignmentId: string };
}) {
  const session = await getCurrentSession();
  // Membership-scoped, which is what gates the coach/admin branch below: the
  // student branch re-checks enrolment by profile id, but staff had only a
  // role check and could read any classroom's completion table.
  const assignment = await getAssignmentForViewer(session, params.assignmentId);
  if (!assignment) notFound();

  const isCoachOrAdmin = (() => {
    try {
      requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
      return true;
    } catch {
      return false;
    }
  })();

  if (isCoachOrAdmin) {
    const completion = await getAssignmentCompletionForClassroom(session.tenantId, assignment.id);

    return (
      <div>
        <h1 className={pageHeadingClass}>{assignment.title}</h1>
        <p className="text-sm text-slate">
          {assignment.classroom.name} · {assignment.puzzles.length} puzzles
        </p>

        <div className={tableWrapperClass}>
          <table className="w-full text-sm">
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>Student</th>
                <th className={thClass}>Solved</th>
              </tr>
            </thead>
            <tbody>
              {completion?.map((row) => (
                <tr key={row.studentId} className={tbodyRowClass}>
                  <td className={tdClass}>{row.email}</td>
                  <td className={tdClass}>
                    <RankProgressBar completed={row.solvedCount} total={row.totalPuzzles} />
                  </td>
                </tr>
              ))}
              {(!completion || completion.length === 0) && (
                <tr>
                  <td colSpan={2} className="px-4 py-6 text-center text-sm text-slate">
                    No students enrolled in this classroom yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // STUDENT view — verify enrollment before showing anything, same check
  // submitPuzzleAttemptAction re-does server-side on every submit.
  if (session.role !== "STUDENT") notFound();
  const studentProfile = await getStudentProfileByUserId(session.tenantId, session.id);
  const isEnrolled =
    studentProfile &&
    assignment.classroom.students.some((s) => s.studentId === studentProfile.id);
  if (!studentProfile || !isEnrolled) notFound();

  const statuses = await getStudentPuzzleStatuses(session.tenantId, assignment.id, studentProfile.id);
  const solvedCount = assignment.puzzles.filter(
    (p) => (statuses.get(p.puzzleId) ?? "unattempted") === "solved"
  ).length;

  const STATUS_BADGE_TONE: Record<"solved" | "attempted" | "unattempted", BadgeTone> = {
    solved: "success",
    attempted: "warn",
    unattempted: "neutral",
  };

  return (
    <div>
      <h1 className={pageHeadingClass}>{assignment.title}</h1>
      <p className="text-sm text-slate">{assignment.classroom.name}</p>

      <div className="mt-4">
        <RankProgressBar completed={solvedCount} total={assignment.puzzles.length} />
      </div>

      <ul className="mt-6 space-y-2">
        {assignment.puzzles.map((assignmentPuzzle) => {
          const status = statuses.get(assignmentPuzzle.puzzleId) ?? "unattempted";
          return (
            <li
              key={assignmentPuzzle.puzzleId}
              className="flex items-center justify-between gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3 text-sm shadow-sm"
            >
              <Link
                href={`/dashboard/homework/${assignment.id}/puzzle/${assignmentPuzzle.puzzleId}`}
                className={textLinkClass}
              >
                Puzzle {assignmentPuzzle.puzzle.rating ? `(rated ${assignmentPuzzle.puzzle.rating})` : ""}
              </Link>
              <Badge tone={STATUS_BADGE_TONE[status]}>{STATUS_LABEL[status]}</Badge>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
