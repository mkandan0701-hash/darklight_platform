import Link from "next/link";
import { getCurrentSession } from "../../../../lib/auth/session";
import { listClassrooms } from "../../../../repositories/classroomRepository";
import { ClassroomForm } from "./ClassroomForm";

export default async function ClassroomsPage() {
  const session = await getCurrentSession();
  const classrooms = await listClassrooms(session.tenantId);

  return (
    <div>
      <h1 className="text-lg font-semibold">Classrooms</h1>
      {session.role === "ACADEMY_ADMIN" && (
        <div className="mt-4">
          <ClassroomForm />
        </div>
      )}
      <ul className="mt-6 space-y-2">
        {classrooms.map((classroom) => (
          <li key={classroom.id}>
            <Link
              href={`/dashboard/classrooms/${classroom.id}`}
              className="text-blue-600 hover:underline"
            >
              {classroom.name}
            </Link>
            <span className="ml-2 text-xs text-gray-500">
              {classroom.students.length} students · {classroom.coaches.length} coaches
            </span>
          </li>
        ))}
        {classrooms.length === 0 && (
          <p className="text-sm text-gray-500">No classrooms yet.</p>
        )}
      </ul>
    </div>
  );
}
