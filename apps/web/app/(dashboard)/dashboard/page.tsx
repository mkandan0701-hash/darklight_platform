import { getCurrentSession } from "../../../lib/auth/session";
import { pageHeadingClass } from "../../../components/ui/styles";

export default async function DashboardHomePage() {
  const session = await getCurrentSession();
  return (
    <div>
      <h1 className={pageHeadingClass}>Welcome back</h1>
      <p className="mt-2 text-sm text-slate">
        Signed in as {session.email} ({session.role.replace("_", " ").toLowerCase()})
      </p>
    </div>
  );
}
