import { redirect } from "next/navigation";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { EmailInput } from "@/components/auth/EmailInput";

export default async function WelcomePage() {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (user) {
    redirect("/home");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 p-8 text-stone-900">
      <div className="w-full max-w-md">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-light tracking-tight">La Fattoria</h1>
          <p className="mt-1 text-sm text-stone-500">Equine Welfare Study</p>
        </header>

        <h2 className="mb-3 text-2xl font-light">Welcome.</h2>
        <p className="mb-6 text-stone-600">
          Enter your email to log in or create your account. We&apos;ll send you a magic link.
        </p>

        <EmailInput />

        <p className="mt-8 text-xs leading-relaxed text-stone-500">
          By using this app you consent to anonymized session data being used for equine
          welfare research.
        </p>
      </div>
    </main>
  );
}
