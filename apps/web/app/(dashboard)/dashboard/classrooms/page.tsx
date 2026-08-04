import Link from "next/link";
import { getCurrentSession } from "../../../../lib/auth/session";
import { listClassroomsForViewer } from "../../../../repositories/classroomRepository";
import { ClassroomForm } from "./ClassroomForm";
import { Card } from "../../../../components/ui/Card";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { pageHeadingClass, textLinkClass } from "../../../../components/ui/styles";

export default async function ClassroomsPage() {
  const session = await getCurrentSession();
  const classrooms = await listClassroomsForViewer(session);

  return (
    <div>
      <h1 className={pageHeadingClass}>Classrooms</h1>
      {session.role === "ACADEMY_ADMIN" && (
        <Card className="mt-4">
          <ClassroomForm />
        </Card>
      )}

      {classrooms.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No classrooms yet"
            description={
              // The list is now the viewer's own rooms, so "none exist" is the
              // wrong story for everyone but the admin.
              {
                ACADEMY_ADMIN:
                  "Create your first classroom above to start enrolling coaches and students.",
                COACH: "Your academy admin hasn't assigned you to a classroom yet.",
                STUDENT: "You're not enrolled in a classroom yet — your academy admin can add you.",
                PARENT: "None of your children are enrolled in a classroom yet.",
              }[session.role]
            }
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {classrooms.map((classroom) => (
            <Card key={classroom.id} className="flex items-center justify-between p-4">
              <Link href={`/dashboard/classrooms/${classroom.id}`} className={textLinkClass}>
                {classroom.name}
              </Link>
              <span className="text-xs text-slate">
                {classroom.students.length} students · {classroom.coaches.length} coaches
              </span>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
