import Link from "next/link";
import { SignupForm } from "./SignupForm";
import { textLinkClass } from "../../../components/ui/styles";
import { AuthShell } from "../../../components/auth/AuthShell";
import { AuthHeading } from "../../../components/auth/AuthHeading";

export default function SignupPage() {
  return (
    <AuthShell heroVariant="academy" footer="Your next move starts here.">
      <AuthHeading title="Create your academy">
        <p>Takes a couple of minutes — no credit card required.</p>
      </AuthHeading>
      <SignupForm />
      <div className="mt-8 border-t border-ink/10 pt-6 text-sm text-slate">
        Already have an academy?{" "}
        <Link href="/login" className={textLinkClass}>
          Sign in
        </Link>
      </div>
    </AuthShell>
  );
}
