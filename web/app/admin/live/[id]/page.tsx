import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { LogoutButton } from "@/components/auth/LogoutButton";
import { createServerSupabaseClient, getUser } from "@/lib/auth/server";

import { LiveClient } from "./LiveClient";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminLiveSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) redirect("/");

  const { data: me } = await supabase
    .from("rider_profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.is_admin) redirect("/home");

  const { data: session } = await supabase
    .from("sessions")
    .select("id, status, horses(name), rider_profiles(display_name)")
    .eq("id", id)
    .maybeSingle();
  if (!session) notFound();

  const rider =
    (session.rider_profiles as { display_name?: string | null } | null)?.display_name ?? "—";
  const horse = (session.horses as { name?: string | null } | null)?.name ?? "—";

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--text-faint)]">
              Admin · Live · {session.status}
            </p>
            <h1 className="text-2xl font-light">
              {rider} · {horse}
            </h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/admin/live"
              className="text-[var(--text-muted)] hover:text-[var(--lime)]"
            >
              ← Live sessions
            </Link>
            <Link
              href={`/admin/sessions/${id}`}
              className="text-[var(--text-muted)] hover:text-[var(--lime)]"
            >
              Detail view
            </Link>
            <LogoutButton />
          </div>
        </header>

        <LiveClient sessionId={id} />
      </div>
    </main>
  );
}
