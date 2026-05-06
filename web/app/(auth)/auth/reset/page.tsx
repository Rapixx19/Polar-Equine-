import { redirect } from "next/navigation";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export default async function ResetPasswordPage() {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  // The reset-password link routes via /auth/callback which exchanges the
  // recovery code for a session before sending the user here. If we still
  // don't see a user the link expired or the exchange failed.
  if (!user) {
    redirect("/auth/error");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 p-8 text-stone-900">
      <div className="w-full max-w-md">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-light tracking-tight">La Fattoria</h1>
          <p className="mt-1 text-sm text-stone-500">Sessions & monitoring</p>
        </header>

        <h2 className="mb-3 text-2xl font-light">Set a new password.</h2>
        <p className="mb-6 text-stone-600">
          Pick a new password. You&apos;ll be signed in straight after.
        </p>

        <ResetPasswordForm />
      </div>
    </main>
  );
}
