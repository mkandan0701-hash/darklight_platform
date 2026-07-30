import { SignupForm } from "./SignupForm";

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-8">
      <h1 className="mb-6 text-xl font-semibold">Create your academy</h1>
      <SignupForm />
    </main>
  );
}
