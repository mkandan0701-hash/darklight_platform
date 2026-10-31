import { redirect } from "next/navigation";
import type { Role } from "@chessplay-clone/shared";
import { SetPasswordForm } from "./SetPasswordForm";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { getCurrentSession } from "../../../lib/auth/session";
import { AuthShell } from "../../../components/auth/AuthShell";
import { AuthHeading } from "../../../components/auth/AuthHeading";

// Copy only — the role changes what we say, never what the page does. A
// parent is setting up their own account to watch a child's progress, so
// "your chess journey" would be wrong for them.
const INTRO_BY_ROLE: Record<Role, string> = {
  STUDENT: "You're one step away from starting your chess journey.",
  PARENT: "One step left — then you can follow your child's lessons, homework and progress.",
  COACH: "One step left — then your classes and students are ready for you.",
  ACADEMY_ADMIN: "One step left — then your academy dashboard is ready.",
};
const DEFAULT_INTRO = "You're one step away from getting started.";

// Reached straight from /auth/callback, which has already exchanged the invite
// token for a session cookie. No session here means the link was stale or
// opened out of order.
export default async function SetPasswordPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?error=signin_required");
  }

  // Best-effort, for the wording above. The gate is getUser() — a missing
  // User row must not stop someone setting a password, so failure here just
  // means the neutral intro.
  const session = await getCurrentSession().catch(() => null);
  const intro = session ? INTRO_BY_ROLE[session.role] : DEFAULT_INTRO;

  return (
    <AuthShell brandLinked={false} footer="Your next move starts here.">
      <AuthHeading title="Create your password">
        <p>{intro}</p>
        {user.email && (
          // Wraps rather than truncates: the whole point is that the person
          // can confirm it's *their* address, so it must never be cut off.
          <p className="mt-4 inline-flex max-w-full flex-wrap items-baseline gap-x-2 rounded-xl border border-ink/10 bg-parchment px-3.5 py-2 text-sm text-ink">
            <span className="whitespace-nowrap text-slate">Signed in as</span>
            <span className="min-w-0 break-all font-semibold">{user.email}</span>
          </p>
        )}
      </AuthHeading>
      <SetPasswordForm email={user.email ?? ""} />
    </AuthShell>
  );
}
