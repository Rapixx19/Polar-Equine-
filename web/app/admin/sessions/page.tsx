import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { activityLabel } from "@/components/session/ActivityTile";
import type { ActivityType } from "@/lib/activities";

import { LiveSessionsBanner } from "./LiveSessionsBanner";

export const dynamic = "force-dynamic";

type SessionRow = {
  id: string;
  rider_id: string;
  horse_id: string;
  activity_type: ActivityType;
  start_time: string;
  end_time: string | null;
  status: string;
  has_prototype_mount: boolean;
  horses: { name: string | null } | null;
  rider_profiles: { display_name: string | null } | null;
};

function durationMinutes(start: string, end: string | null): string {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return `${Math.round(ms / 60_000)} min`;
}

export default async function AdminSessionsPage() {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) redirect("/");

  const { data: me } = await supabase
    .from("rider_profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.is_admin) redirect("/home");

  const { data: rows } = await supabase
    .from("sessions")
    .select(
      "id, rider_id, horse_id, activity_type, start_time, end_time, status, has_prototype_mount, horses(name), rider_profiles(display_name)",
    )
    .order("start_time", { ascending: false })
    .limit(50);

  const sessions = (rows ?? []) as unknown as SessionRow[];

  // Aggregate disconnect events per listed session so the audit takes one glance
  // instead of clicking into each detail page. kind='lost' is the proxy for
  // GATT drops; weak is HR-contact noise and not what we're auditing here.
  const dropsBySession = new Map<string, number>();
  if (sessions.length > 0) {
    const ids = sessions.map((s) => s.id);
    const { data: drops } = await supabase
      .from("session_signal_events")
      .select("session_id")
      .eq("kind", "lost")
      .in("session_id", ids);
    for (const row of drops ?? []) {
      const sid = (row as { session_id: string }).session_id;
      dropsBySession.set(sid, (dropsBySession.get(sid) ?? 0) + 1);
    }
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--text-faint)]">Admin · Sessions</p>
            <h1 className="text-2xl font-light">All sessions</h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/admin" className="text-[var(--text-muted)] hover:text-[var(--lime)]">
              Riders
            </Link>
            <Link href="/admin/prototype" className="text-[var(--text-muted)] hover:text-[var(--lime)]">
              Prototype
            </Link>
            <Link href="/home" className="text-[var(--text-muted)] hover:text-[var(--lime)]">
              Rider view
            </Link>
            <LogoutButton />
          </div>
        </header>

        <LiveSessionsBanner />

        {sessions.length === 0 ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--text-muted)]">
            No sessions recorded yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/admin/sessions/${s.id}`}
                  className="grid grid-cols-12 items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--text)] hover:border-[var(--lime)]"
                >
                  <span className="col-span-3 text-[var(--text-muted)]">
                    {new Date(s.start_time).toLocaleString()}
                  </span>
                  <span className="col-span-3 truncate">{s.rider_profiles?.display_name ?? "—"}</span>
                  <span className="col-span-2 truncate">{s.horses?.name ?? "—"}</span>
                  <span className="col-span-2 flex items-center gap-2">
                    <span>{activityLabel(s.activity_type)}</span>
                    {s.has_prototype_mount && (
                      <span
                        title="Recorded with prototype girth mount"
                        className="inline-flex items-center rounded-full border border-[var(--lime)]/60 bg-[var(--lime)]/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--lime)]"
                      >
                        Prototype
                      </span>
                    )}
                  </span>
                  <span className="col-span-1 flex items-center gap-1.5 text-[var(--text-muted)]">
                    <span>{durationMinutes(s.start_time, s.end_time)}</span>
                    {(dropsBySession.get(s.id) ?? 0) > 0 && (
                      <span
                        title={`${dropsBySession.get(s.id)} disconnect events`}
                        className="inline-flex items-center rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                      >
                        ⚠{dropsBySession.get(s.id)}
                      </span>
                    )}
                  </span>
                  <span className="col-span-1 text-right text-xs uppercase tracking-wide text-[var(--text-faint)]">
                    {s.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
