// Admin-only data helpers. Each function takes a `supabase` client argument
// so a future research/freelancer slice can call the same helpers against an
// anonymised view + read-only DB role without touching this module.
//
// Admin RLS bypass: every relevant policy includes `OR is_admin_check()` (see
// migrations 005, 010, 011, 013), so an admin's normal anon-key client returns
// all rows. No service-role usage here.

import type { TypedSupabaseClient } from "@/lib/auth/server";

const SESSIONS_PAGE_SIZE = 50;
const JOBS_PAGE_SIZE = 25;
const SAMPLES_PREVIEW_LIMIT = 100;
const SAMPLES_CHART_LIMIT = 5000;

export type AdminSessionRow = {
  id: string;
  start_time: string;
  end_time: string | null;
  activity_type: string;
  riding_subtype: string | null;
  activity_note: string | null;
  status: string | null;
  metrics_status: string | null;
  horse: { id: string; name: string } | null;
  rider: { id: string; display_name: string | null } | null;
};

export type AdminSessionDetail = {
  session: AdminSessionRow & {
    horse_id: string;
    rider_id: string;
    notes: string | null;
  };
  metrics: Record<string, unknown> | null;
  jobs: Array<Record<string, unknown>>;
  sampleCount: number;
  samplesPreview: Array<{
    id: number;
    timestamp_ms: number;
    hr_bpm: number | null;
    rr_ms: number | null;
    contact: boolean | null;
  }>;
  samplesForChart: Array<{
    timestamp_ms: number;
    hr_bpm: number | null;
    contact: boolean | null;
  }>;
};

export type AdminHorseRow = {
  id: string;
  name: string;
  breed: string | null;
  date_of_birth: string | null;
};

export type AdminJobRow = {
  id: string;
  session_id: string;
  job_type: string;
  status: string;
  attempts: number;
  last_error: string | null;
  next_run_at: string;
  created_at: string | null;
  session: { activity_type: string; start_time: string } | null;
};

type ListSessionsOpts = {
  page?: number;
  status?: "active" | "completed" | "abandoned" | "all";
  metrics?: "pending" | "complete" | "failed" | "all";
};

const SESSION_SELECT =
  "id, start_time, end_time, activity_type, riding_subtype, activity_note, status, metrics_status, horse:horses(id, name), rider:rider_profiles(id, display_name)";

function collapseRel<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel;
}

function normaliseSessionRow(row: Record<string, unknown>): AdminSessionRow {
  return {
    id: row.id as string,
    start_time: row.start_time as string,
    end_time: (row.end_time as string | null) ?? null,
    activity_type: row.activity_type as string,
    riding_subtype: (row.riding_subtype as string | null) ?? null,
    activity_note: (row.activity_note as string | null) ?? null,
    status: (row.status as string | null) ?? null,
    metrics_status: (row.metrics_status as string | null) ?? null,
    horse: collapseRel(row.horse as { id: string; name: string } | { id: string; name: string }[] | null),
    rider: collapseRel(
      row.rider as { id: string; display_name: string | null } | { id: string; display_name: string | null }[] | null,
    ),
  };
}

export async function listAllSessions(
  supabase: TypedSupabaseClient,
  opts: ListSessionsOpts = {},
): Promise<{ rows: AdminSessionRow[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const offset = (page - 1) * SESSIONS_PAGE_SIZE;

  let q = supabase
    .from("sessions")
    .select(SESSION_SELECT, { count: "exact" })
    .order("start_time", { ascending: false })
    .range(offset, offset + SESSIONS_PAGE_SIZE - 1);

  if (opts.status && opts.status !== "all") {
    q = q.eq("status", opts.status);
  }
  if (opts.metrics && opts.metrics !== "all") {
    q = q.eq("metrics_status", opts.metrics);
  }

  const { data, count, error } = await q;
  if (error) throw error;
  const rows = ((data as Record<string, unknown>[] | null) ?? []).map(normaliseSessionRow);
  return { rows, total: count ?? 0, page, pageSize: SESSIONS_PAGE_SIZE };
}

export async function listSessionsForHorse(
  supabase: TypedSupabaseClient,
  horseId: string,
  opts: ListSessionsOpts = {},
): Promise<{ rows: AdminSessionRow[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const offset = (page - 1) * SESSIONS_PAGE_SIZE;

  let q = supabase
    .from("sessions")
    .select(SESSION_SELECT, { count: "exact" })
    .eq("horse_id", horseId)
    .order("start_time", { ascending: false })
    .range(offset, offset + SESSIONS_PAGE_SIZE - 1);

  if (opts.status && opts.status !== "all") {
    q = q.eq("status", opts.status);
  }

  const { data, count, error } = await q;
  if (error) throw error;
  const rows = ((data as Record<string, unknown>[] | null) ?? []).map(normaliseSessionRow);
  return { rows, total: count ?? 0, page, pageSize: SESSIONS_PAGE_SIZE };
}

export async function getSessionDetail(
  supabase: TypedSupabaseClient,
  sessionId: string,
): Promise<AdminSessionDetail | null> {
  const sessionDetailSelect = `id, horse_id, rider_id, activity_type, riding_subtype, activity_note, start_time, end_time, status, metrics_status, notes, horse:horses(id, name), rider:rider_profiles(id, display_name)`;

  const [sessionRes, metricsRes, jobsRes, sampleCountRes, samplesRes, chartRes] = await Promise.all([
    supabase.from("sessions").select(sessionDetailSelect).eq("id", sessionId).maybeSingle(),
    supabase.from("session_metrics").select("*").eq("session_id", sessionId).maybeSingle(),
    supabase
      .from("compute_jobs")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false }),
    supabase
      .from("samples_hr")
      .select("*", { count: "exact", head: true })
      .eq("session_id", sessionId),
    supabase
      .from("samples_hr")
      .select("id, timestamp_ms, hr_bpm, rr_ms, contact")
      .eq("session_id", sessionId)
      .order("timestamp_ms", { ascending: true })
      .range(0, SAMPLES_PREVIEW_LIMIT - 1),
    supabase
      .from("samples_hr")
      .select("timestamp_ms, hr_bpm, contact")
      .eq("session_id", sessionId)
      .order("timestamp_ms", { ascending: true })
      .range(0, SAMPLES_CHART_LIMIT - 1),
  ]);

  if (!sessionRes.data) return null;
  const raw = sessionRes.data as Record<string, unknown>;
  const session = {
    ...normaliseSessionRow(raw),
    horse_id: raw.horse_id as string,
    rider_id: raw.rider_id as string,
    notes: (raw.notes as string | null) ?? null,
  };
  return {
    session,
    metrics: (metricsRes.data as Record<string, unknown> | null) ?? null,
    jobs: ((jobsRes.data as Array<Record<string, unknown>> | null) ?? []),
    sampleCount: sampleCountRes.count ?? 0,
    samplesPreview:
      ((samplesRes.data as AdminSessionDetail["samplesPreview"] | null) ?? []),
    samplesForChart:
      ((chartRes.data as AdminSessionDetail["samplesForChart"] | null) ?? []),
  };
}

export async function listAllHorses(
  supabase: TypedSupabaseClient,
): Promise<{ rows: AdminHorseRow[] }> {
  const { data, error } = await supabase
    .from("horses")
    .select("id, name, breed, date_of_birth")
    .order("name", { ascending: true });
  if (error) throw error;
  return { rows: ((data as AdminHorseRow[] | null) ?? []) };
}

type ListJobsOpts = {
  page?: number;
  status?: "queued" | "running" | "succeeded" | "failed" | "all";
};

export async function listComputeJobs(
  supabase: TypedSupabaseClient,
  opts: ListJobsOpts = {},
): Promise<{ rows: AdminJobRow[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const offset = (page - 1) * JOBS_PAGE_SIZE;
  const status = opts.status ?? "failed";

  let q = supabase
    .from("compute_jobs")
    .select(
      "id, session_id, job_type, status, attempts, last_error, next_run_at, created_at, session:sessions(activity_type, start_time)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + JOBS_PAGE_SIZE - 1);

  if (status !== "all") {
    q = q.eq("status", status);
  }

  const { data, count, error } = await q;
  if (error) throw error;
  const rows = ((data as Array<Record<string, unknown>> | null) ?? []).map((r) => ({
    id: r.id as string,
    session_id: r.session_id as string,
    job_type: r.job_type as string,
    status: r.status as string,
    attempts: r.attempts as number,
    last_error: (r.last_error as string | null) ?? null,
    next_run_at: r.next_run_at as string,
    created_at: (r.created_at as string | null) ?? null,
    session: collapseRel(
      r.session as { activity_type: string; start_time: string } | { activity_type: string; start_time: string }[] | null,
    ),
  }));
  return { rows, total: count ?? 0, page, pageSize: JOBS_PAGE_SIZE };
}
