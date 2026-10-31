import Link from "next/link";
import { getCurrentSession } from "../../../../lib/auth/session";
import { requireRole } from "../../../../lib/auth/requireRole";
import { formatInZone, nextWeekendLocalDefault } from "../../../../lib/time";
import { displayName } from "../../../../lib/displayName";
import { listSimuls } from "../../../../repositories/simulRepository";
import {
  getStudentProfileByUserId,
  listParentsAndStudents,
} from "../../../../repositories/userRepository";
import { CreateSimulForm } from "./CreateSimulForm";
import { Card } from "../../../../components/ui/Card";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { pageHeadingClass, textLinkClass } from "../../../../components/ui/styles";

export default async function SimulsPage() {
  const session = await getCurrentSession();

  const isCoach = (() => {
    try {
      requireRole(session, ["COACH"]);
      return true;
    } catch {
      return false;
    }
  })();

  const simuls = await listSimuls(session.tenantId);

  // A student only ever has a seat at their own board, so their view is the
  // list of boards that belong to them — not the whole exhibition.
  const studentProfile =
    session.role === "STUDENT"
      ? await getStudentProfileByUserId(session.tenantId, session.id)
      : null;

  const { students } = await listParentsAndStudents(session.tenantId);
  const nameByStudentId = new Map(students.map((s) => [s.id, displayName(s.user)]));

  return (
    <div>
      <h1 className={pageHeadingClass}>Simuls</h1>
      <p className="mt-1 text-sm text-slate">
        One coach, many boards at once. Times are shown in your own timezone.
      </p>

      {isCoach && (
        <Card className="mt-4">
          <CreateSimulForm
            students={students.map((s) => ({ id: s.id, label: displayName(s.user) }))}
            defaultStart={nextWeekendLocalDefault(session.timezone)}
          />
        </Card>
      )}

      {simuls.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No simuls yet"
            description={
              isCoach
                ? "Pick your opponents above — each gets their own board, and you play them all."
                : "Your coach hasn't scheduled a simul yet."
            }
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {simuls.map((simul) => {
            const myBoard = studentProfile
              ? simul.boards.find((b) => b.studentId === studentProfile.id)
              : null;

            return (
              <Card key={simul.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-ink">
                      {formatInZone(simul.startsAtUtc, session.timezone)}
                    </p>
                    <p className="text-xs text-slate">{simul.boards.length} boards</p>
                  </div>
                  {myBoard && (
                    <Link
                      href={`/dashboard/simuls/boards/${myBoard.id}`}
                      className={textLinkClass}
                    >
                      Play board {myBoard.boardIdx} →
                    </Link>
                  )}
                </div>

                {isCoach && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {simul.boards.map((board) => (
                      <li key={board.id}>
                        <Link
                          href={`/dashboard/simuls/boards/${board.id}`}
                          className="inline-block rounded border border-slate-light px-2 py-1 text-xs text-slate hover:text-ink"
                        >
                          {board.boardIdx}. {nameByStudentId.get(board.studentId) ?? "Unknown"}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </ul>
      )}
    </div>
  );
}
