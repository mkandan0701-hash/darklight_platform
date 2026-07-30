import { getCurrentSession } from "../../../lib/auth/session";

export default async function DashboardHomePage() {
  const session = await getCurrentSession();
  return (
    <div>
      <h1 className="text-lg font-semibold">Welcome back</h1>
      <p className="mt-2 text-sm text-gray-500">
        Signed in as {session.email} ({session.role.replace("_", " ").toLowerCase()})
      </p>
    </div>
  );
}
