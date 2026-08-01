import Link from "next/link";
import { LoginForm } from "./LoginForm";
import { Card } from "../../../components/ui/Card";
import { textLinkClass } from "../../../components/ui/styles";
import { authErrorMessage } from "../../../lib/auth/redirects";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  // Set by /auth/callback when an invite or recovery link can't be verified.
  const notice = authErrorMessage(searchParams.error);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <Link href="/" className="mb-8 text-center font-display text-lg font-semibold text-ink">
        Chess Academy Platform
      </Link>
      <Card>
        <h1 className="font-display text-xl font-semibold text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-slate">Welcome back — enter your academy login below.</p>
        {notice && (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-brick-light px-3 py-2 text-sm text-brick"
          >
            {notice}
          </p>
        )}
        <div className="mt-6">
          <LoginForm />
        </div>
      </Card>
      <p className="mt-6 text-center text-sm text-slate">
        New academy?{" "}
        <Link href="/signup" className={textLinkClass}>
          Create one
        </Link>
      </p>
    </main>
  );
}
