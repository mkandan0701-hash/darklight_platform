import { getCurrentSession } from "../../../../lib/auth/session";
import { displayName } from "../../../../lib/displayName";
import { ProfileForm } from "./ProfileForm";
import { Card } from "../../../../components/ui/Card";
import { pageHeadingClass } from "../../../../components/ui/styles";

// Open to every role, unlike /dashboard/settings — that page is the academy's
// branding and belongs to the admin; this one is the person's own name.
export default async function ProfilePage() {
  const session = await getCurrentSession();

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
    </div>
  );
}
