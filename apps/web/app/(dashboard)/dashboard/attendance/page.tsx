import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentSession } from "../../../../lib/auth/session";
import { requireRole } from "../../../../lib/auth/requireRole";
import { listClassrooms } from "../../../../repositories/classroomRepository";
import { Card } from "../../../../components/ui/Card";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { pageHeadingClass, textLinkClass } from "../../../../components/ui/styles";

export default async function AttendancePage() {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
  } catch {
    notFound();
  }

  const classrooms = await listClassrooms(session.tenantId);
  const isAdmin = session.role === "ACADEMY_ADMIN";
  // An admin oversees the academy; a coach only sees rooms they teach.
  const myClassrooms = isAdmin
    ? classrooms
    : classrooms.filter((c) => c.coaches.some((cc) => cc.coach.user.id === session.id));

  return (
    <div>
      <h1 className={pageHeadingClass}>Attendance</h1>
      <p className="mt-1 text-sm text-slate">
        Pick a classroom to mark a session or see who&rsquo;s been turning up.
      </p>

      {myClassrooms.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={isAdmin ? "No classrooms yet" : "No classrooms assigned"}
            description={
              isAdmin
                ? "Create a classroom and schedule a session before there's anything to mark."
                : "Your academy admin hasn't assigned you to a classroom yet."
            }
            action={
              isAdmin ? (
                <Link href="/dashboard/classrooms" className={textLinkClass}>
                  Go to classrooms
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {myClassrooms.map((classroom) => (
            <Card key={classroom.id} className="flex items-center justify-between gap-4 p-4">
              <Link href={`/dashboard/attendance/${classroom.id}`} className={textLinkClass}>
                {classroom.name}
              </Link>
              <span className="text-xs text-slate">{classroom.students.length} students</span>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
