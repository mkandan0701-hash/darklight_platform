import { redirect } from "next/navigation";
import { SetPasswordForm } from "./SetPasswordForm";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { Card } from "../../../components/ui/Card";

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

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <p className="mb-8 text-center font-display text-lg font-semibold text-ink">
        Chess Academy Platform
      </p>
      <Card>
        <h1 className="font-display text-xl font-semibold text-ink">Choose a password</h1>
        <p className="mt-1 text-sm text-slate">
          Signed in as {user.email}. Set a password to finish activating your account.
        </p>
        <div className="mt-6">
          <SetPasswordForm />
        </div>
      </Card>
    </main>
  );
}
