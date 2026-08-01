import { getCurrentSession } from "../../../../lib/auth/session";
import { requireRole } from "../../../../lib/auth/requireRole";
import {
  listParentsAndStudents,
  listParentStudentLinks,
  listTenantMembers,
} from "../../../../repositories/userRepository";
import { InviteForm } from "./InviteForm";
import { ParentStudentLinks } from "./ParentStudentLinks";
import { cardClass } from "../../../../components/ui/Card";
import {
  pageHeadingClass,
  tableWrapperClass,
  tbodyRowClass,
  tdClass,
  thClass,
  theadRowClass,
} from "../../../../components/ui/styles";

const ROLE_BADGE_CLASS: Record<string, string> = {
  ACADEMY_ADMIN: "bg-gold-light text-ink",
  COACH: "bg-board-light text-board-dark",
  STUDENT: "bg-parchment text-ink",
  PARENT: "bg-parchment text-ink",
};

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
      <h1 className={pageHeadingClass}>Members</h1>
      <div className={`mt-4 ${cardClass}`}>
        <InviteForm />
      </div>
      <div className={tableWrapperClass}>
        <table className="w-full text-sm">
          <thead>
            <tr className={theadRowClass}>
              <th className={thClass}>Email</th>
              <th className={thClass}>Role</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className={tbodyRowClass}>
                <td className={tdClass}>{member.email}</td>
                <td className={tdClass}>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      ROLE_BADGE_CLASS[member.role] ?? "bg-parchment text-ink"
                    }`}
                  >
                    {member.role.replace("_", " ")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
