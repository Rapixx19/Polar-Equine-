import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";

// Stub for Slice 12.D — wires the footer "All sessions" link to a real
// route so it stops being a dead button. The full list view ships in a
// later slice (filters, pagination, per-session navigation).
export default async function AllSessionsPage() {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) {
    redirect("/");
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto w-full max-w-lg">
        <Link
          href="/home"
          className="mb-6 inline-block text-sm text-[var(--text-muted)] hover:text-[var(--lime)]"
        >
          ← Back
        </Link>
        <h1 className="mb-2 text-2xl font-light">All sessions</h1>
        <p className="mb-8 text-sm text-[var(--text-muted)]">
          A full list of your past sessions is coming soon. For now, your most recent session is
          summarised on the home page right after you finish recording.
        </p>
        <Link
          href="/home"
          className="inline-block rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] transition hover:border-[var(--lime)]"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
