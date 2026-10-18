import { getCurrentSession } from "../../../../lib/auth/session";
import { displayName } from "../../../../lib/displayName";
import { getStudentProfileByUserId } from "../../../../repositories/userRepository";
import { ProfileForm } from "./ProfileForm";
import { ChessAccountsForm } from "./ChessAccountsForm";
import { Card } from "../../../../components/ui/Card";
import { pageHeadingClass, sectionHeadingClass } from "../../../../components/ui/styles";

// Open to every role, unlike /dashboard/settings — that page is the academy's
// branding and belongs to the admin; this one is the person's own name.
export default async function ProfilePage() {
  const session = await getCurrentSession();

  // Only a student has external chess accounts to link. A coach's own playing
  // accounts aren't tracked by anything in the product, so offering the field
  // would be a form that saves into nothing.
  const studentProfile =
    session.role === "STUDENT"
      ? await getStudentProfileByUserId(session.tenantId, session.id)
      : null;

  return (
    <div>
      <h1 className={pageHeadingClass}>Your profile</h1>
      <p className="mt-1 text-sm text-slate">
        {session.email} · times shown in {session.timezone}
      </p>
      <Card className="mt-4 max-w-sm">
        <ProfileForm
          defaultDisplayName={session.displayName ?? ""}
          fallbackName={displayName({ email: session.email })}
        />
      </Card>

      {studentProfile && (
        <section className="mt-8">
          <h2 className={sectionHeadingClass}>Chess accounts</h2>
          <p className="mt-1 text-sm text-slate">
            Linking an account imports your games so your coach can review them.
          </p>
          <Card className="mt-3 max-w-sm">
            <ChessAccountsForm
              defaults={{
                lichessHandle: studentProfile.lichessHandle ?? "",
                chesscomHandle: studentProfile.chesscomHandle ?? "",
                fideId: studentProfile.fideId ?? "",
                uscfId: studentProfile.uscfId ?? "",
                eclId: studentProfile.eclId ?? "",
              }}
            />
          </Card>
        </section>
      )}
    </div>
  );
}
