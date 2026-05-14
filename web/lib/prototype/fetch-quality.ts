// Server-side fetch of the quality rows the comparison aggregates over.
// Pulls sessions split by has_prototype_mount, joins session_metrics for
// the quality scores, and joins session_signal_events for the per-session
// weak/lost totals. Returns rows ready for aggregateBucket().
//
// Admin-gated callers only — this leaks per-session quality data across
// all riders, which is fine for admin but never exposed to riders.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SessionQualityRow } from "./aggregate";

type SignalEventRow = { session_id: string; t_start_ms: number; t_end_ms: number };
type SessionRow = {
  id: string;
  start_time: string;
  end_time: string | null;
};
type MetricsRow = {
  session_id: string;
  rr_cleaning_quality: number | null;
  hrv_completeness_quality: number | null;
  workload_quality: number | null;
};
type HrCountRow = { session_id: string; count: number };

function durationMs(s: SessionRow): number | null {
  if (!s.end_time) return null;
  const ms = new Date(s.end_time).getTime() - new Date(s.start_time).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

export async function fetchBucketRows(
  supabase: SupabaseClient,
  hasPrototypeMount: boolean,
): Promise<SessionQualityRow[]> {
  // Only ended sessions — active rides have no duration yet and skew everything.
  const { data: sessionRows, error: sessErr } = await supabase
    .from("sessions")
    .select("id, start_time, end_time")
    .eq("has_prototype_mount", hasPrototypeMount)
    .not("end_time", "is", null);
  if (sessErr) throw new Error(`fetch_sessions_failed: ${sessErr.message}`);
  const sessions = (sessionRows ?? []) as SessionRow[];
  if (sessions.length === 0) return [];

  const ids = sessions.map((s) => s.id);

  const [metricsRes, eventsRes, hrCountsRes] = await Promise.all([
    supabase
      .from("session_metrics")
      .select("session_id, rr_cleaning_quality, hrv_completeness_quality, workload_quality")
      .in("session_id", ids),
    supabase
      .from("session_signal_events")
      .select("session_id, t_start_ms, t_end_ms")
      .in("session_id", ids),
    // PostgREST does not aggregate without an RPC, so we count per-session in JS.
    // For up to a few hundred sessions the row volume is small (HR is ~1 row/s).
    // If this becomes hot, swap for a SQL view + RLS-respecting RPC.
    supabase
      .from("samples_hr")
      .select("session_id")
      .in("session_id", ids),
  ]);

  if (metricsRes.error) throw new Error(`fetch_metrics_failed: ${metricsRes.error.message}`);
  if (eventsRes.error) throw new Error(`fetch_events_failed: ${eventsRes.error.message}`);
  if (hrCountsRes.error) throw new Error(`fetch_hr_count_failed: ${hrCountsRes.error.message}`);

  const metricsBy = new Map<string, MetricsRow>();
  for (const m of (metricsRes.data ?? []) as MetricsRow[]) metricsBy.set(m.session_id, m);

  const eventsBy = new Map<string, { seconds: number; count: number }>();
  for (const e of (eventsRes.data ?? []) as SignalEventRow[]) {
    const span = Math.max(0, (Number(e.t_end_ms) - Number(e.t_start_ms)) / 1000);
    const cur = eventsBy.get(e.session_id) ?? { seconds: 0, count: 0 };
    eventsBy.set(e.session_id, { seconds: cur.seconds + span, count: cur.count + 1 });
  }

  const hrCountBy = new Map<string, number>();
  for (const row of (hrCountsRes.data ?? []) as HrCountRow[]) {
    hrCountBy.set(row.session_id, (hrCountBy.get(row.session_id) ?? 0) + 1);
  }

  return sessions.map((s) => {
    const evt = eventsBy.get(s.id) ?? { seconds: 0, count: 0 };
    const m = metricsBy.get(s.id);
    return {
      session_id: s.id,
      duration_ms: durationMs(s),
      signal_event_seconds: evt.seconds,
      signal_event_count: evt.count,
      rr_cleaning_quality: m?.rr_cleaning_quality ?? null,
      hrv_completeness_quality: m?.hrv_completeness_quality ?? null,
      workload_quality: m?.workload_quality ?? null,
      hr_sample_count: hrCountBy.get(s.id) ?? 0,
    };
  });
}
