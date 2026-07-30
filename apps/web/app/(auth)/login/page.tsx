import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-8">
      <h1 className="mb-6 text-xl font-semibold">Sign in</h1>
      <LoginForm />
    </main>
  );
}
