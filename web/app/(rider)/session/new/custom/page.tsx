import Link from "next/link";
import { redirect } from "next/navigation";

import { CustomActivityForm } from "@/components/session/CustomActivityForm";
import { createServerSupabaseClient, getUser } from "@/lib/auth/server";

export default async function CustomActivityPage() {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) redirect("/");

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto w-full max-w-lg">
        <Link
          href="/home"
          className="mb-6 inline-block text-sm text-[var(--text-muted)] hover:text-[var(--lime)]"
        >
          ← Back
        </Link>
        <p className="mb-1 text-xs uppercase tracking-wide text-[var(--text-faint)]">
          Custom session
        </p>
        <h1 className="mb-2 text-2xl font-light">Something else?</h1>
        <p className="mb-6 text-sm text-[var(--text-muted)]">
          Type a quick note about what this is. We&rsquo;ll save it under &ldquo;Other&rdquo; and you can review it later.
        </p>
        <CustomActivityForm />
      </div>
    </main>
  );
}
