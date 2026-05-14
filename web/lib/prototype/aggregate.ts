// Pure aggregation helpers for the prototype-vs-baseline comparison.
// Given two arrays of session quality summaries, compute the metrics the
// admin page renders side-by-side and the Claude prompt summarises.
//
// No I/O — the DB queries live in the API route / page; this module just
// reduces the rows. Keeps the logic testable in isolation.

export type SessionQualityRow = {
  session_id: string;
  duration_ms: number | null;
  signal_event_seconds: number;
  signal_event_count: number;
  rr_cleaning_quality: number | null;
  hrv_completeness_quality: number | null;
  workload_quality: number | null;
  hr_sample_count: number;
};

export type BucketAggregate = {
  session_count: number;
  total_duration_min: number;
  avg_duration_min: number | null;
  signal_event_seconds_per_min: number | null;
  avg_signal_events_per_session: number | null;
  avg_rr_cleaning_quality: number | null;
  avg_hrv_completeness_quality: number | null;
  avg_workload_quality: number | null;
  avg_hr_samples_per_min: number | null;
};

function mean(xs: Array<number | null>): number | null {
  const filtered = xs.filter((x): x is number => x != null && Number.isFinite(x));
  if (filtered.length === 0) return null;
  return filtered.reduce((s, x) => s + x, 0) / filtered.length;
}

export function aggregateBucket(rows: SessionQualityRow[]): BucketAggregate {
  if (rows.length === 0) {
    return {
      session_count: 0,
      total_duration_min: 0,
      avg_duration_min: null,
      signal_event_seconds_per_min: null,
      avg_signal_events_per_session: null,
      avg_rr_cleaning_quality: null,
      avg_hrv_completeness_quality: null,
      avg_workload_quality: null,
      avg_hr_samples_per_min: null,
    };
  }
  const totalDurationMs = rows.reduce((s, r) => s + (r.duration_ms ?? 0), 0);
  const totalDurationMin = totalDurationMs / 60_000;
  const totalEventSeconds = rows.reduce((s, r) => s + r.signal_event_seconds, 0);
  const totalEvents = rows.reduce((s, r) => s + r.signal_event_count, 0);
  const samplesPerMin = rows.map((r) =>
    r.duration_ms && r.duration_ms > 0
      ? r.hr_sample_count / (r.duration_ms / 60_000)
      : null,
  );
  return {
    session_count: rows.length,
    total_duration_min: Math.round(totalDurationMin * 10) / 10,
    avg_duration_min: rows.length > 0 ? totalDurationMin / rows.length : null,
    signal_event_seconds_per_min: totalDurationMin > 0 ? totalEventSeconds / totalDurationMin : null,
    avg_signal_events_per_session: totalEvents / rows.length,
    avg_rr_cleaning_quality: mean(rows.map((r) => r.rr_cleaning_quality)),
    avg_hrv_completeness_quality: mean(rows.map((r) => r.hrv_completeness_quality)),
    avg_workload_quality: mean(rows.map((r) => r.workload_quality)),
    avg_hr_samples_per_min: mean(samplesPerMin),
  };
}

export type ComparisonAggregate = {
  baseline: BucketAggregate;
  prototype: BucketAggregate;
};
