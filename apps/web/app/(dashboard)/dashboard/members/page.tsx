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
import { Badge, type BadgeTone } from "../../../../components/ui/Badge";
import { displayName } from "../../../../lib/displayName";
import {
  pageHeadingClass,
  tableWrapperClass,
  tbodyRowClass,
  tdClass,
  thClass,
  theadRowClass,
} from "../../../../components/ui/styles";

// Staff stand out, the people they teach don't need to. STUDENT and PARENT
// were "bg-parchment text-ink" before Badge existed; neutral is the same
// background against the slate every other unremarkable pill in the app uses.
const ROLE_BADGE_TONE: Record<string, BadgeTone> = {
  ACADEMY_ADMIN: "warn",
  COACH: "success",
  STUDENT: "neutral",
  PARENT: "neutral",
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
              <th className={thClass}>Name</th>
              <th className={thClass}>Email</th>
              <th className={thClass}>Role</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className={tbodyRowClass}>
                {/* Shows the email local part until they set a name of their
                    own — never blank, and never a second copy of the address
                    next to the one in the column beside it. */}
                <td className={tdClass}>{displayName(member)}</td>
                <td className={tdClass}>{member.email}</td>
                <td className={tdClass}>
                  <Badge tone={ROLE_BADGE_TONE[member.role] ?? "neutral"}>
                    {member.role.replace("_", " ")}
                  </Badge>
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
