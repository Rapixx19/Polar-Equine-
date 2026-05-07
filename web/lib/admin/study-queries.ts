// Study Management read-only helpers (slice 12.A). Same pattern as
// web/lib/admin/queries.ts: take a supabase client argument so a future
// research/freelancer slice can pass an anonymised view + read-only role
// without touching this module. Anon-key only — admin RLS bypass is via
// is_admin_check() on the new tables (see migration 019).

import type { TypedSupabaseClient } from "@/lib/auth/server";

import { mapSessionToResearchLabel, type ResearchLabel } from "@/lib/admin/study-mapping";

export type StudySettings = {
  weekly_target_per_rider: number;
  v0_phase_weeks: number;
  realistic_completion: number;
  realistic_qc_pass: number;
  storage_mb_per_session: number;
  storage_quota_mb: number;
  storage_migration_trigger_pct: number;
  advisory_sessions_per_horse_per_week: number;
  advisory_jumping_per_horse_per_week: number;
  advisory_gallop_per_horse_per_week: number;
  advisory_min_hours_between: number;
};

export type AllocationTarget = {
  type: ResearchLabel;
  sort_order: number;
  pct: number;
  label: string;
  color: string;
  emphasis: "foundation" | "state-rich" | "specialized" | "core";
};

export type StudyRider = {
  id: string;
  display_name: string | null;
  yard: string | null;
  joined_week: number | null;
  primary_discipline: string | null;
  weekly_target_override: number | null;
  is_active: boolean;
  sessions_completed: number;
  last_session: string | null;
  qc_pass_rate: number | null;
  flags_raised: number;
};

export type StudyHorse = {
  id: string;
  name: string;
  level: string | null;
  discipline: string | null;
  is_holdout: boolean;
  advisory_weekly_cap_override: number | null;
  age_years: number | null;
  sex: string | null;
  sessions_completed: number;
};

export type AllocationTally = {
  label: ResearchLabel | "Unmapped";
  count: number;
};

export async function getStudySettings(supabase: TypedSupabaseClient): Promise<StudySettings> {
  const { data, error } = await supabase
    .from("study_settings")
    .select(
      "weekly_target_per_rider, v0_phase_weeks, realistic_completion, realistic_qc_pass, storage_mb_per_session, storage_quota_mb, storage_migration_trigger_pct, advisory_sessions_per_horse_per_week, advisory_jumping_per_horse_per_week, advisory_gallop_per_horse_per_week, advisory_min_hours_between",
    )
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("study_settings row missing — migration 019 not applied");
  return data as StudySettings;
}

export async function getAllocationTargets(supabase: TypedSupabaseClient): Promise<AllocationTarget[]> {
  const { data, error } = await supabase
    .from("study_allocation_targets")
    .select("type, sort_order, pct, label, color, emphasis")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data as AllocationTarget[] | null) ?? [];
}

export async function listStudyRiders(
  supabase: TypedSupabaseClient,
  opts: { includeInactive?: boolean } = {},
): Promise<StudyRider[]> {
  let q = supabase
    .from("rider_profiles")
    .select(
      "id, display_name, yard, joined_week, primary_discipline, weekly_target_override, is_active",
    );
  if (!opts.includeInactive) q = q.eq("is_active", true);
  const { data: riders, error } = await q;
  if (error) throw error;
  if (!riders || riders.length === 0) return [];

  const riderIds = riders.map((r) => r.id);

  const [sessionsRes, jobsRes] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, rider_id, start_time, status, metrics_status")
      .in("rider_id", riderIds),
    supabase
      .from("compute_jobs")
      .select("session_id, status, sessions!inner(rider_id)")
      .in("status", ["failed"]),
  ]);

  type SessionRow = { id: string; rider_id: string; start_time: string; status: string | null; metrics_status: string | null };
  type JobRow = { session_id: string; status: string; sessions: { rider_id: string } | { rider_id: string }[] | null };

  const sessions = (sessionsRes.data as SessionRow[] | null) ?? [];
  const jobs = (jobsRes.data as JobRow[] | null) ?? [];

  return riders.map((r) => {
    const mine = sessions.filter((s) => s.rider_id === r.id);
    const completed = mine.filter((s) => s.status === "completed");
    const lastSession = mine.map((s) => s.start_time).sort().at(-1) ?? null;

    const withMetrics = mine.filter((s) => s.metrics_status !== null);
    const passing = withMetrics.filter((s) => s.metrics_status === "complete").length;
    const qc = withMetrics.length > 0 ? passing / withMetrics.length : null;

    const myFlags = jobs.filter((j) => {
      const rel = j.sessions;
      const riderId = Array.isArray(rel) ? rel[0]?.rider_id : rel?.rider_id;
      return riderId === r.id;
    }).length;

    return {
      id: r.id,
      display_name: r.display_name,
      yard: r.yard,
      joined_week: r.joined_week,
      primary_discipline: r.primary_discipline,
      weekly_target_override: r.weekly_target_override,
      is_active: r.is_active,
      sessions_completed: completed.length,
      last_session: lastSession,
      qc_pass_rate: qc,
      flags_raised: myFlags,
    } satisfies StudyRider;
  });
}

export async function listStudyHorses(supabase: TypedSupabaseClient): Promise<StudyHorse[]> {
  const { data: horses, error } = await supabase
    .from("horses")
    .select(
      "id, name, date_of_birth, sex, level, discipline, is_holdout, advisory_weekly_cap_override",
    )
    .order("name", { ascending: true });
  if (error) throw error;
  if (!horses || horses.length === 0) return [];

  const ids = horses.map((h) => h.id);
  const { data: sessions } = await supabase
    .from("sessions")
    .select("horse_id")
    .in("horse_id", ids);

  const counts = new Map<string, number>();
  ((sessions as Array<{ horse_id: string }> | null) ?? []).forEach((s) => {
    counts.set(s.horse_id, (counts.get(s.horse_id) ?? 0) + 1);
  });

  return horses.map((h) => ({
    id: h.id,
    name: h.name,
    level: h.level,
    discipline: h.discipline,
    is_holdout: h.is_holdout,
    advisory_weekly_cap_override: h.advisory_weekly_cap_override,
    age_years: h.date_of_birth
      ? Math.floor((Date.now() - new Date(h.date_of_birth).valueOf()) / (365.25 * 24 * 3600 * 1000))
      : null,
    sex: h.sex,
    sessions_completed: counts.get(h.id) ?? 0,
  } satisfies StudyHorse));
}

export async function listSessionsByResearchLabel(
  supabase: TypedSupabaseClient,
): Promise<AllocationTally[]> {
  const { data, error } = await supabase
    .from("sessions")
    .select("activity_type, riding_subtype")
    .eq("status", "completed");
  if (error) throw error;

  const tally = new Map<ResearchLabel | "Unmapped", number>();
  ((data as Array<{ activity_type: string; riding_subtype: string | null }> | null) ?? []).forEach((s) => {
    const label = mapSessionToResearchLabel(s.activity_type, s.riding_subtype) ?? "Unmapped";
    tally.set(label, (tally.get(label) ?? 0) + 1);
  });
  return Array.from(tally.entries()).map(([label, count]) => ({ label, count }));
}
