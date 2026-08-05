import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentSession } from "../../../../lib/auth/session";
import { requireRole } from "../../../../lib/auth/requireRole";
import { displayName } from "../../../../lib/displayName";
import { formatAttendanceRate } from "../../../../lib/attendance";
import {
  getParentProfileByUserId,
  listStudentsForParent,
} from "../../../../repositories/userRepository";
import { getStudentAttendanceSummary } from "../../../../repositories/attendanceRepository";
import { listAssignmentsForStudent } from "../../../../repositories/assignmentRepository";
import { Card } from "../../../../components/ui/Card";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { RankProgressBar } from "../../../../components/ui/RankProgressBar";
import { pageHeadingClass, textLinkClass } from "../../../../components/ui/styles";

export default async function ChildrenPage() {
  const session = await getCurrentSession();
  // Parent-only by design. Staff read this data through their own classroom
  // and attendance views; admitting them here would mean a second visibility
  // rule to keep correct for no product gain.
  try {
    requireRole(session, ["PARENT"]);
  } catch {
    notFound();
  }

  const parentProfile = await getParentProfileByUserId(session.tenantId, session.id);
  const links = parentProfile
    ? await listStudentsForParent(session.tenantId, parentProfile.id)
    : [];

  const children = await Promise.all(
    links.map(async (link) => {
      const [attendance, assignments] = await Promise.all([
        getStudentAttendanceSummary(session.tenantId, link.studentId),
        listAssignmentsForStudent(session.tenantId, link.studentId),
      ]);
      return {
        studentId: link.studentId,
        name: displayName(link.student.user.email),
        attendance,
        assignmentCount: assignments.length,
      };
    })
  );

  return (
    <div>
      <h1 className={pageHeadingClass}>Your children</h1>

      {children.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No students linked yet"
            description="Once your academy links your child's account to yours, their classes, homework and attendance will show up here."
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {children.map((child) => (
            <Card
              key={child.studentId}
              className="flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <Link href={`/dashboard/children/${child.studentId}`} className={textLinkClass}>
                {child.name}
              </Link>
              <div className="flex flex-wrap items-center gap-4">
                <RankProgressBar
                  completed={child.attendance.attendedCount}
                  total={child.attendance.sessionCount}
                  label={`${child.name} attended ${child.attendance.attendedCount} of ${child.attendance.sessionCount} sessions`}
                />
                <span className="text-xs text-slate">
                  {child.attendance.sessionCount === 0
                    ? "no attendance marked yet"
                    : `${formatAttendanceRate(
                        child.attendance.attendedCount,
                        child.attendance.sessionCount
                      )} attendance`}
                </span>
                <span className="text-xs text-slate">
                  {child.assignmentCount === 0
                    ? "no homework yet"
                    : `${child.assignmentCount} ${
                        child.assignmentCount === 1 ? "assignment" : "assignments"
                      }`}
                </span>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
