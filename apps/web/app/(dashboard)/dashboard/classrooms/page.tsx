import Link from "next/link";
import { getCurrentSession } from "../../../../lib/auth/session";
import { listClassrooms } from "../../../../repositories/classroomRepository";
import { ClassroomForm } from "./ClassroomForm";
import { Card } from "../../../../components/ui/Card";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { pageHeadingClass, textLinkClass } from "../../../../components/ui/styles";

export default async function ClassroomsPage() {
  const session = await getCurrentSession();
  const classrooms = await listClassrooms(session.tenantId);

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
              session.role === "ACADEMY_ADMIN"
                ? "Create your first classroom above to start enrolling coaches and students."
                : "Your academy admin hasn't created any classrooms yet."
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
