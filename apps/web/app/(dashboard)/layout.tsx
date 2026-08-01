import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentSession } from "../../lib/auth/session";
import { requireRole } from "../../lib/auth/requireRole";
import { getTenantBySubdomain } from "../../repositories/tenantRepository";
import { UnauthorizedError, TenantMismatchError } from "../../lib/auth/errors";
import { logout } from "../../lib/auth/actions";
import { DashboardNav } from "../../components/dashboard/DashboardNav";

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

  // An invitee who wanders off /set-password still has a working session, so
  // nothing would otherwise stop them — until it expires and they're locked
  // out with no password to sign back in with.
  if (session.mustSetPassword) {
    redirect("/set-password");
  }

  const isAdmin = (() => {
    try {
      requireRole(session, ["ACADEMY_ADMIN"]);
      return true;
    } catch {
      return false;
    }
  })();

  const canManagePuzzles = (() => {
    try {
      requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
      return true;
    } catch {
      return false;
    }
  })();

  // Separate from canManagePuzzles despite the same role set — they gate
  // unrelated features and will drift apart.
  const canMarkAttendance = (() => {
    try {
      requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
      return true;
    } catch {
      return false;
    }
  })();

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/dashboard/classrooms", label: "Classrooms" },
    { href: "/dashboard/homework", label: "Homework" },
    ...(canMarkAttendance ? [{ href: "/dashboard/attendance", label: "Attendance" }] : []),
    { href: "/dashboard/play", label: "Play" },
    { href: "/dashboard/analysis", label: "Analysis" },
    ...(canManagePuzzles ? [{ href: "/dashboard/puzzles", label: "Puzzles" }] : []),
    ...(isAdmin ? [{ href: "/dashboard/members", label: "Members" }] : []),
    ...(isAdmin ? [{ href: "/dashboard/settings", label: "Settings" }] : []),
  ];

  return (
    <div className="min-h-screen bg-parchment">
      <DashboardNav
        tenantName={tenant.name}
        logoUrl={tenant.logoUrl}
        brandColor={tenant.brandColor}
        links={links}
        logoutAction={logout}
      />
      <main className="mx-auto max-w-5xl px-6 py-8 md:px-8">{children}</main>
    </div>
  );
}
