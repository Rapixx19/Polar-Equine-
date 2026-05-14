// Pure shaping helpers that take raw DB rows and build the
// `InsightInput` consumed by `buildInsightPrompt`. Kept separate from
// the route so the mapping is unit-testable without mocking Supabase.

import type { InsightInput, LabelSummary } from "./prompt";

export type RawLabelRow = {
  corrected_start_ms: number | null;
  corrected_end_ms: number | null;
  corrected_label_type: string | null;
  corrected_jump_count: number | null;
  auto_start_ms: number;
  auto_end_ms: number;
  auto_label_type: string;
};

export type RawSessionRow = {
  activity_type: string;
  start_time: string;
  end_time: string | null;
};

export function summariseLabels(rows: RawLabelRow[]): LabelSummary[] {
  const acc = new Map<string, LabelSummary>();
  for (const r of rows) {
    const start = r.corrected_start_ms ?? r.auto_start_ms;
    const end = r.corrected_end_ms ?? r.auto_end_ms;
    const label = (r.corrected_label_type ?? r.auto_label_type) || "unknown";
    const jumps = r.corrected_jump_count ?? 0;
    const total_ms = Math.max(0, end - start);
    const prev = acc.get(label);
    if (prev) {
      prev.total_ms += total_ms;
      prev.jump_count += jumps;
    } else {
      acc.set(label, { label, total_ms, jump_count: jumps });
    }
  }
  return Array.from(acc.values()).sort((a, b) => b.total_ms - a.total_ms);
}

export function buildInsightInput(
  session: RawSessionRow,
  metrics: Record<string, unknown> | null,
  labelRows: RawLabelRow[],
): InsightInput {
  const durationMs = session.end_time
    ? new Date(session.end_time).getTime() - new Date(session.start_time).getTime()
    : null;
  return {
    activity_type: session.activity_type,
    started_at: session.start_time,
    duration_ms: durationMs,
    metrics,
    labels: summariseLabels(labelRows),
    hr_summary: {
      avg: (metrics?.hr_avg as number | null) ?? null,
      peak: (metrics?.hr_peak as number | null) ?? null,
      min: (metrics?.hr_min as number | null) ?? null,
      time_z1_s: (metrics?.time_z1_s as number | null) ?? null,
      time_z2_s: (metrics?.time_z2_s as number | null) ?? null,
      time_z3_s: (metrics?.time_z3_s as number | null) ?? null,
      time_z4_s: (metrics?.time_z4_s as number | null) ?? null,
      time_z5_s: (metrics?.time_z5_s as number | null) ?? null,
    },
  };
}
