import { getCurrentSession } from "../../../../lib/auth/session";
import { requireRole } from "../../../../lib/auth/requireRole";
import {
  listParentsAndStudents,
  listParentStudentLinks,
  listTenantMembers,
} from "../../../../repositories/userRepository";
import { InviteForm } from "./InviteForm";
import { ParentStudentLinks } from "./ParentStudentLinks";

export default async function MembersPage() {
  const session = await getCurrentSession();
  requireRole(session, ["ACADEMY_ADMIN"]);
  const [members, { parents, students }, links] = await Promise.all([
    listTenantMembers(session.tenantId),
    listParentsAndStudents(session.tenantId),
    listParentStudentLinks(session.tenantId),
  ]);

  return (
    <div>
      <h1 className="text-lg font-semibold">Members</h1>
      <div className="mt-4">
        <InviteForm />
      </div>
      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Email</th>
            <th className="py-2">Role</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id} className="border-b">
              <td className="py-2">{member.email}</td>
              <td className="py-2">{member.role}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-8">
        <ParentStudentLinks
          parents={parents.map((parent) => ({
            profileId: parent.id,
            email: parent.user.email,
          }))}
          students={students.map((student) => ({
            profileId: student.id,
            email: student.user.email,
          }))}
          links={links.map((link) => ({
            id: link.id,
            parentEmail: link.parent.user.email,
            studentEmail: link.student.user.email,
          }))}
        />
      </div>
    </div>
  );
}
