import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentSession } from "../../lib/auth/session";
import { requireRole } from "../../lib/auth/requireRole";
import { getTenantBySubdomain } from "../../repositories/tenantRepository";
import { UnauthorizedError, TenantMismatchError } from "../../lib/auth/errors";
import { logout } from "../../lib/auth/actions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const subdomain = headers().get("x-tenant-subdomain") ?? "";
  const tenant = await getTenantBySubdomain(subdomain);
  if (!tenant) {
    redirect("/signup");
  }

  let session;
  try {
    session = await getCurrentSession();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect("/login");
    }
    throw err;
  }

  if (session.tenantId !== tenant.id) {
    throw new TenantMismatchError(
      "Signed-in user does not belong to this academy"
    );
  }

  const isAdmin = (() => {
    try {
      requireRole(session, ["ACADEMY_ADMIN"]);
      return true;
    } catch {
      return false;
    }
  })();

  return (
    <div className="min-h-screen">
      <nav className="flex items-center justify-between border-b px-6 py-4">
        <span className="font-semibold">{tenant.name}</span>
        <div className="flex items-center gap-4 text-sm">
          <a href="/dashboard">Dashboard</a>
          <a href="/dashboard/classrooms">Classrooms</a>
          {isAdmin && <a href="/dashboard/members">Members</a>}
          {isAdmin && <a href="/dashboard/settings">Settings</a>}
          <form action={logout}>
            <button type="submit" className="text-gray-500 hover:text-black">
              Log out
            </button>
          </form>
        </div>
      </nav>
      <main className="p-8">{children}</main>
    </div>
  );
}
