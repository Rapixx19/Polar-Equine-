import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { EmailPasswordForm } from "@/components/auth/EmailPasswordForm";

export default async function WelcomePage() {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (user) {
    // is_admin auto-routes to /admin; /home handles the rider redirect to
    // /auth/provision when no profile exists yet.
    const { data: profile } = await supabase
      .from("rider_profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();
    redirect(profile?.is_admin ? "/admin" : "/home");
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

        <h2 className="mb-3 text-2xl font-light">Welcome.</h2>
        <p className="mb-6 text-[var(--text-muted)]">
          Sign in with the email and password your admin set up for you.
        </p>

        <EmailPasswordForm />

        <p className="mt-8 text-center text-xs text-[var(--text-faint)]">
          <Link
            href="/admin"
            className="underline underline-offset-2 hover:text-[var(--lime)]"
          >
            Admin sign-in →
          </Link>
        </p>
      </div>
    </main>
  );
}
