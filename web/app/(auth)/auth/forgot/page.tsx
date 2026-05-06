import { redirect } from "next/navigation";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default async function ForgotPasswordPage() {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (user) {
    redirect("/home");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-md">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-light tracking-tight">La Fattoria</h1>
          <p className="mt-1 text-sm text-[var(--text-faint)]">
            Sessions & monitoring
          </p>
        </header>

        <h2 className="mb-3 text-2xl font-light">Reset your password.</h2>
        <p className="mb-6 text-[var(--text-muted)]">
          Enter your email and we&apos;ll send you a one-time link to set a new
          password.
        </p>

        <ForgotPasswordForm />
      </div>
    </main>
  );
}
