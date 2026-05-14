import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { RiderRow } from "@/components/admin/RiderRow";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) redirect("/");

  const { data: me } = await supabase
    .from("rider_profiles")
    .select("is_admin, display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!me?.is_admin) redirect("/home");

  const { data: riders } = await supabase
    .from("rider_profiles")
    .select(
      "id, display_name, is_admin, session_quota_target, program_end_date, total_sessions, created_at",
    )
    .order("created_at", { ascending: true });

  const list = riders ?? [];

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--text-faint)]">Admin</p>
            <h1 className="text-2xl font-light">Riders</h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/admin/live" className="font-medium text-[var(--lime)] hover:underline">
              Live
            </Link>
            <Link href="/admin/sessions" className="text-[var(--text-muted)] hover:text-[var(--lime)]">
              Sessions
            </Link>
            <Link href="/home" className="text-[var(--text-muted)] hover:text-[var(--lime)]">
              Rider view
            </Link>
            <LogoutButton />
          </div>
        </header>

        <p className="mb-4 text-sm text-[var(--text-muted)]">
          Edit each rider&rsquo;s session quota and program end date. Changes save on Enter or blur.
        </p>

        {list.length === 0 ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--text-muted)]">
            No rider profiles yet.
          </div>
        ) : (
          <ul className="space-y-3">
            {list.map((r) => (
              <li key={r.id}>
                <RiderRow rider={r} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
