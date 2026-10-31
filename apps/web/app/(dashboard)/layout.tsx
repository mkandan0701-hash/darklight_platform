import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DateTime } from "luxon";
import { getCurrentSession } from "../../lib/auth/session";
import { getTenantBySubdomain } from "../../repositories/tenantRepository";
import { UnauthorizedError, TenantMismatchError } from "../../lib/auth/errors";
import { logout } from "../../lib/auth/actions";
import { displayName } from "../../lib/displayName";
import { AppShell } from "../../components/dashboard/shell/AppShell";
import { AccountMenu } from "../../components/dashboard/shell/AccountMenu";
import { ZoneClock } from "../../components/dashboard/shell/ZoneClock";

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

  // Which links a role may see now lives in components/dashboard/shell/
  // navLinks.ts, where the rules are tested without rendering a page. The
  // boolean ladder this layout used to carry moved there wholesale.
  return (
    <AppShell
      role={session.role}
      tenantName={tenant.name}
      logoUrl={tenant.logoUrl}
      brandColor={tenant.brandColor}
      header={
        <>
          <ZoneClock
            zone={session.timezone}
            initialNow={DateTime.now().setZone(session.timezone).toFormat("h:mm a")}
          />
          <AccountMenu
            name={displayName(session)}
            email={session.email}
            logoutAction={logout}
          />
        </>
      }
    >
      {children}
    </AppShell>
  );
}
