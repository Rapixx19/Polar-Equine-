import Link from "next/link";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/auth/LogoutButton";
import { createServerSupabaseClient, getUser } from "@/lib/auth/server";

import { ActiveSessionList } from "./ActiveSessionList";

export const dynamic = "force-dynamic";

export default async function AdminLivePage() {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) redirect("/");

  const { data: me } = await supabase
    .from("rider_profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.is_admin) redirect("/home");

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--text-faint)]">Admin · Live</p>
            <h1 className="text-2xl font-light">Active sessions</h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/admin" className="text-[var(--text-muted)] hover:text-[var(--lime)]">
              ← Riders
            </Link>
            <Link
              href="/admin/sessions"
              className="text-[var(--text-muted)] hover:text-[var(--lime)]"
            >
              All sessions
            </Link>
            <LogoutButton />
          </div>
        </header>

        <p className="mb-4 text-sm text-[var(--text-muted)]">
          Sessions currently recording. Updates every 5 s.
        </p>

        <ActiveSessionList />
      </div>
    </main>
  );
}
