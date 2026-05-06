type Props = {
  metrics: Record<string, unknown> | null;
};

const METRIC_KEYS: Array<{ key: string; label: string; suffix?: string }> = [
  { key: "algo_version", label: "Algo version" },
  { key: "computed_at", label: "Computed at" },
  { key: "duration_s", label: "Duration", suffix: "s" },
  { key: "hr_avg", label: "HR avg", suffix: "bpm" },
  { key: "hr_peak", label: "HR peak", suffix: "bpm" },
  { key: "hr_min", label: "HR min", suffix: "bpm" },
  { key: "hr_sd", label: "HR sd" },
  { key: "avg_hr_pct", label: "Avg HR %" },
  { key: "rmssd_ms", label: "RMSSD", suffix: "ms" },
  { key: "sdnn_ms", label: "SDNN", suffix: "ms" },
  { key: "pnn50_pct", label: "pNN50", suffix: "%" },
  { key: "pnn20_pct", label: "pNN20", suffix: "%" },
  { key: "recovery_tau_s", label: "Recovery τ", suffix: "s" },
  { key: "recovery_fit_quality", label: "Recovery fit q." },
  { key: "hrv_completeness_quality", label: "HRV completeness" },
  { key: "rr_cleaning_quality", label: "RR cleaning" },
  { key: "workload_quality", label: "Workload q." },
  { key: "trimp_banister", label: "TRIMP" },
  { key: "jump_count", label: "Jump count" },
  { key: "time_z1_s", label: "Z1", suffix: "s" },
  { key: "time_z2_s", label: "Z2", suffix: "s" },
  { key: "time_z3_s", label: "Z3", suffix: "s" },
  { key: "time_z4_s", label: "Z4", suffix: "s" },
  { key: "time_z5_s", label: "Z5", suffix: "s" },
  { key: "time_walk_s", label: "Walk", suffix: "s" },
  { key: "time_trot_s", label: "Trot", suffix: "s" },
  { key: "time_canter_s", label: "Canter", suffix: "s" },
  { key: "time_gallop_s", label: "Gallop", suffix: "s" },
  { key: "time_rest_s", label: "Rest", suffix: "s" },
];

function fmtVal(v: unknown, suffix?: string): string {
  if (v == null) return "—";
  if (typeof v === "number") {
    const rounded = Number.isInteger(v) ? v : Math.round(v * 1000) / 1000;
    return suffix ? `${rounded} ${suffix}` : String(rounded);
  }
  return String(v);
}

export function MetricsCard({ metrics }: Props) {
  if (!metrics) {
    return (
      <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-6 text-sm text-[var(--text-muted)]">
        Metrics not yet computed.
      </div>
    );
  }
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-4 text-sm md:grid-cols-3">
      {METRIC_KEYS.map(({ key, label, suffix }) => (
        <div key={key} className="flex justify-between gap-2">
          <dt className="text-[var(--text-faint)]">{label}</dt>
          <dd className="tabular-nums text-[var(--text)]">{fmtVal(metrics[key], suffix)}</dd>
        </div>
      ))}
    </dl>
  );
}
