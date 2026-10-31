import Link from "next/link";
import { LoginForm } from "./LoginForm";
import { textLinkClass } from "../../../components/ui/styles";
import { authErrorMessage } from "../../../lib/auth/redirects";
import { AuthShell } from "../../../components/auth/AuthShell";
import { AuthHeading } from "../../../components/auth/AuthHeading";
import { AuthAlert } from "../../../components/auth/AuthAlert";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  // Set by /auth/callback when an invite or recovery link can't be verified.
  const notice = authErrorMessage(searchParams.error);

  return (
    <AuthShell footer="Your next move starts here.">
      <AuthHeading title="Welcome back">
        <p>Sign in to your academy to pick up where you left off.</p>
      </AuthHeading>
      {notice && <AuthAlert className="mb-6">{notice}</AuthAlert>}
      <LoginForm />

      {/* There is no self-serve reset yet, so say what actually works rather
          than show a link to a page that doesn't exist. */}
      <p className="mt-6 text-sm leading-relaxed text-slate">
        Forgot your password? Ask your academy admin to send you a new invite link.
      </p>

      <div className="mt-8 border-t border-ink/10 pt-6 text-sm text-slate">
        Running a chess academy?{" "}
        <Link href="/signup" className={textLinkClass}>
          Create your academy
        </Link>
      </div>
    </AuthShell>
  );
}
