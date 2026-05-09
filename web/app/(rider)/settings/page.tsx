import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";

// Stub for Slice 12.D — wires the footer "Settings" link to a real route
// so it stops being a dead button. Full settings (display name edit,
// password change, sign-out, version info) ship in a later slice.
export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) {
    redirect("/");
  }

  const { data: profile } = await supabase
    .from("rider_profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto w-full max-w-lg">
        <Link
          href="/home"
          className="mb-6 inline-block text-sm text-[var(--text-muted)] hover:text-[var(--lime)]"
        >
          ← Back
        </Link>
        <h1 className="mb-2 text-2xl font-light">Settings</h1>
        <p className="mb-8 text-sm text-[var(--text-muted)]">
          Editable settings (display name, password, sign-out) are coming soon.
        </p>

        <dl className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-[var(--text-muted)]">Signed in as</dt>
            <dd className="text-[var(--text)]">{user.email ?? "—"}</dd>
          </div>
          {profile?.display_name ? (
            <div className="flex items-center justify-between">
              <dt className="text-[var(--text-muted)]">Display name</dt>
              <dd className="text-[var(--text)]">{profile.display_name}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </main>
  );
}
