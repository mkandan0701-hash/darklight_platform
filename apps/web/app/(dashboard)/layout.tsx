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
    if (session.tenantId !== tenant.id) {
      throw new TenantMismatchError(
        "Signed-in user does not belong to this academy"
      );
    }
  } catch (err) {
    // This layout is the route boundary, so it is where typed errors become
    // responses (claude.md §7). The mismatch used to escape unhandled: sign-in
    // succeeded, /dashboard answered 500 with an empty page, and nothing told
    // the person their account lives on a different subdomain.
    if (err instanceof UnauthorizedError) {
      redirect("/login");
    }
    if (err instanceof TenantMismatchError) {
      // Their session cookie stays valid — it's genuinely their account, just
      // the wrong academy — so /login explains it rather than looping. It
      // renders the form without checking for a session, so there's no bounce.
      redirect("/login?error=tenant_mismatch");
    }
    throw err;
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

  // A parent reads about their child; they don't do homework or play the
  // engine. Their per-child homework lives on the portal page, and /dashboard
  // /homework has nothing for them. Note this hides links, it does not gate
  // routes: /play and /analysis stay reachable by URL and render no tenant
  // data, so there is nothing there to authorize.
  const isParent = (() => {
    try {
      requireRole(session, ["PARENT"]);
      return true;
    } catch {
      return false;
    }
  })();

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/dashboard/classrooms", label: "Classrooms" },
    ...(isParent ? [] : [{ href: "/dashboard/homework", label: "Homework" }]),
    ...(canMarkAttendance ? [{ href: "/dashboard/attendance", label: "Attendance" }] : []),
    ...(isParent
      ? []
      : [
          { href: "/dashboard/play", label: "Play" },
          { href: "/dashboard/analysis", label: "Analysis" },
        ]),
    ...(canManagePuzzles ? [{ href: "/dashboard/puzzles", label: "Puzzles" }] : []),
    ...(isAdmin ? [{ href: "/dashboard/members", label: "Members" }] : []),
    ...(isAdmin ? [{ href: "/dashboard/settings", label: "Settings" }] : []),
    // Every role, including parents — it's their own name, not the academy's.
    { href: "/dashboard/profile", label: "Profile" },
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
