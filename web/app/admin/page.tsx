import Link from "next/link";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/auth/LogoutButton";
import { HorseRosterTable } from "@/components/admin/HorseRosterTable";
import { KpiStrip } from "@/components/admin/KpiStrip";
import { ObjectiveKpiStrip } from "@/components/admin/ObjectiveKpiStrip";
import { RosterTable } from "@/components/admin/RosterTable";
import {
  buildKpis,
  buildRiderRollups,
  sortRollupsByActivity,
  type DashboardRiderProfile,
  type DashboardSessionRow,
} from "@/lib/admin/dashboard-rollup";
import {
  buildHorseKpis,
  buildHorseRollups,
  sortHorseRollupsByActivity,
  type HorseProfile,
  type HorseSessionRow,
} from "@/lib/admin/horse-rollup";
import { createServerSupabaseClient, getUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

type SessionWithMetricsRow = {
  rider_id: string;
  horse_id: string | null;
  start_time: string;
  end_time: string | null;
  has_prototype_mount: boolean;
  session_metrics: {
    rr_cleaning_quality: number | null;
    hrv_completeness_quality: number | null;
    workload_quality: number | null;
  } | null;
};

export default async function AdminPage() {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) redirect("/");

  const { data: me } = await supabase
    .from("rider_profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.is_admin) redirect("/home");

  const [profilesRes, sessionsRes, horsesRes] = await Promise.all([
    supabase
      .from("rider_profiles")
      .select(
        "id, display_name, is_admin, session_quota_target, program_end_date, admin_notes, next_focus, created_at",
      )
      .order("created_at", { ascending: true }),
    supabase
      .from("sessions")
      .select(
        "rider_id, horse_id, start_time, end_time, has_prototype_mount, session_metrics(rr_cleaning_quality, hrv_completeness_quality, workload_quality)",
      ),
    supabase
      .from("horses")
      .select("id, name, target_session_count, target_ride_minutes, admin_notes")
      .order("name", { ascending: true }),
  ]);

  const profiles = (profilesRes.data ?? []) as DashboardRiderProfile[];
  const rawSessions = (sessionsRes.data ?? []) as unknown as SessionWithMetricsRow[];
  const sessions = rawSessions.map(
    (s): DashboardSessionRow => ({
      rider_id: s.rider_id,
      start_time: s.start_time,
      end_time: s.end_time,
      has_prototype_mount: s.has_prototype_mount,
      rr_cleaning_quality: s.session_metrics?.rr_cleaning_quality ?? null,
      hrv_completeness_quality: s.session_metrics?.hrv_completeness_quality ?? null,
      workload_quality: s.session_metrics?.workload_quality ?? null,
    }),
  );
  const horseSessions: HorseSessionRow[] = rawSessions.map((s) => ({
    horse_id: s.horse_id,
    start_time: s.start_time,
    end_time: s.end_time,
  }));
  const horses = (horsesRes.data ?? []) as HorseProfile[];

  const rollups = sortRollupsByActivity(buildRiderRollups(profiles, sessions));
  const kpis = buildKpis(rollups, sessions);
  const horseRollups = sortHorseRollupsByActivity(buildHorseRollups(horses, horseSessions));
  const horseKpis = buildHorseKpis(horseRollups);

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--text-faint)]">Admin</p>
            <h1 className="text-2xl font-light">Study dashboard</h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/admin/live" className="font-medium text-[var(--lime)] hover:underline">
              Live
            </Link>
            <Link
              href="/admin/sessions"
              className="text-[var(--text-muted)] hover:text-[var(--lime)]"
            >
              Sessions
            </Link>
            <Link
              href="/admin/prototype"
              className="text-[var(--text-muted)] hover:text-[var(--lime)]"
            >
              Prototype
            </Link>
            <Link href="/home" className="text-[var(--text-muted)] hover:text-[var(--lime)]">
              Rider view
            </Link>
            <LogoutButton />
          </div>
        </header>

        <KpiStrip kpis={kpis} />

        <ObjectiveKpiStrip kpis={horseKpis} />

        <RosterTable rollups={rollups} />

        <HorseRosterTable rollups={horseRollups} />
      </div>
    </main>
  );
}
