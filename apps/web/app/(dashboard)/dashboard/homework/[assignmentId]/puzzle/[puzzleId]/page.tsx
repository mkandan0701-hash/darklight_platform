import { notFound } from "next/navigation";
import { getCurrentSession } from "../../../../../../../lib/auth/session";
import { requireRoleOrNotFound } from "../../../../../../../lib/auth/requireRole";
import { getStudentProfileByUserId } from "../../../../../../../repositories/userRepository";
import { getAssignment } from "../../../../../../../repositories/assignmentRepository";
import { PuzzleAttemptBoard } from "./PuzzleAttemptBoard";
import { pageHeadingClass } from "../../../../../../../components/ui/styles";

export default async function PuzzleAttemptPage({
  params,
}: {
  params: { assignmentId: string; puzzleId: string };
}) {
  const session = await getCurrentSession();
  // This is the app's first genuinely student-facing page — hard-gate the
  // role, then re-verify enrollment/puzzle-membership the same way
  // submitPuzzleAttemptAction does server-side, since there's no existing
  // precedent for "does this student have access to this specific resource."
  requireRoleOrNotFound(session, ["STUDENT"]);

  const studentProfile = await getStudentProfileByUserId(session.tenantId, session.id);
  if (!studentProfile) notFound();

  const assignment = await getAssignment(session.tenantId, params.assignmentId);
  if (!assignment) notFound();

  const isEnrolled = assignment.classroom.students.some(
    (s) => s.studentId === studentProfile.id
  );
  if (!isEnrolled) notFound();

  const assignmentPuzzle = assignment.puzzles.find((ap) => ap.puzzleId === params.puzzleId);
  if (!assignmentPuzzle) notFound();

  return (
    <div>
      <h1 className={pageHeadingClass}>{assignment.title}</h1>
      <p className="font-mono text-sm text-slate">
        {assignmentPuzzle.puzzle.rating ? `Rated ${assignmentPuzzle.puzzle.rating}` : "Puzzle"}
      </p>
      <div className="mt-4">
        <PuzzleAttemptBoard
          assignmentId={assignment.id}
          puzzleId={assignmentPuzzle.puzzleId}
          fen={assignmentPuzzle.puzzle.fen}
          solutionMoves={assignmentPuzzle.puzzle.moves}
        />
      </div>
    </div>
  );
}
