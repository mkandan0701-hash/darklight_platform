import Link from "next/link";
import { SignupForm } from "./SignupForm";
import { Card } from "../../../components/ui/Card";
import { textLinkClass } from "../../../components/ui/styles";

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <Link href="/" className="mb-8 text-center font-display text-lg font-semibold text-ink">
        Chess Academy Platform
      </Link>
      <Card>
        <h1 className="font-display text-xl font-semibold text-ink">Create your academy</h1>
        <p className="mt-1 text-sm text-slate">Takes a couple of minutes — no credit card required.</p>
        <div className="mt-6">
          <SignupForm />
        </div>
      </Card>
      <p className="mt-6 text-center text-sm text-slate">
        Already have an academy?{" "}
        <Link href="/login" className={textLinkClass}>
          Sign in
        </Link>
      </p>
    </main>
  );
}
