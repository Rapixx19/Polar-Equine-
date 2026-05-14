import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { LogoutButton } from "@/components/auth/LogoutButton";
import { activityLabel } from "@/components/session/ActivityTile";
import type { ActivityType } from "@/lib/activities";
import { createServerSupabaseClient, getUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SessionRow = {
  id: string;
  activity_type: ActivityType;
  start_time: string;
  end_time: string | null;
  status: string;
  metrics_status: string | null;
  horses: { name: string | null } | null;
};

function durationLabel(start: string, end: string | null): string {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return `${Math.round(ms / 60_000)} min`;
}

export default async function AdminRiderDetailPage({
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

  const { data: rider } = await supabase
    .from("rider_profiles")
    .select(
      "id, display_name, is_admin, session_quota_target, program_end_date, total_sessions, consented_at, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!rider) notFound();

  const { data: sessionsData, count } = await supabase
    .from("sessions")
    .select(
      "id, activity_type, start_time, end_time, status, metrics_status, horses(name)",
      { count: "exact" },
    )
    .eq("rider_id", id)
    .order("start_time", { ascending: false })
    .limit(200);

  const sessions = (sessionsData ?? []) as unknown as SessionRow[];
  const approved = sessions.filter((s) => s.status === "approved").length;
  const quotaPct = rider.session_quota_target
    ? Math.min(100, Math.round((approved / rider.session_quota_target) * 100))
    : 0;

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--text-faint)]">Admin · Rider</p>
            <h1 className="text-2xl font-light">{rider.display_name}</h1>
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

        <dl className="mb-6 grid grid-cols-2 gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm md:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-[var(--text-faint)]">Approved</dt>
            <dd className="tabular-nums">
              {approved} / {rider.session_quota_target ?? "—"}{" "}
              <span className="text-xs text-[var(--text-faint)]">({quotaPct}%)</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-[var(--text-faint)]">Total sessions</dt>
            <dd className="tabular-nums">{count ?? sessions.length}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-[var(--text-faint)]">Program ends</dt>
            <dd>{rider.program_end_date ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-[var(--text-faint)]">Joined</dt>
            <dd>{rider.created_at ? new Date(rider.created_at).toLocaleDateString() : "—"}</dd>
          </div>
        </dl>

        <h2 className="mb-2 text-sm font-medium text-[var(--text-muted)]">
          Sessions ({sessions.length}
          {count && count > sessions.length ? ` of ${count}` : ""})
        </h2>

        {sessions.length === 0 ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--text-muted)]">
            No sessions recorded for this rider yet.
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
                  <span className="col-span-3 truncate">{s.horses?.name ?? "—"}</span>
                  <span className="col-span-2">{activityLabel(s.activity_type)}</span>
                  <span className="col-span-2 text-[var(--text-muted)]">
                    {durationLabel(s.start_time, s.end_time)}
                  </span>
                  <span className="col-span-2 text-right text-xs uppercase tracking-wide text-[var(--text-faint)]">
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
