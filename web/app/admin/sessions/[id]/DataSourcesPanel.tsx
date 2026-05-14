export type SourceCounts = {
  samples_hr: number;
  samples_acc: number;
  samples_ecg: number;
  labels_auto: number;
  label_corrections: number;
  session_metrics: number;
};

const SOURCE_ROWS: Array<{ key: keyof SourceCounts; stream: string; sensor: string }> = [
  { key: "samples_hr", stream: "samples_hr", sensor: "Polar H10 · HRS 0x180D · ~1 Hz HR + R-R + contact" },
  { key: "samples_acc", stream: "samples_acc", sensor: "Polar H10 · PMD · 52 Hz tri-axial accel (Slice 12)" },
  { key: "samples_ecg", stream: "samples_ecg", sensor: "Polar H10 · PMD · 130 Hz raw ECG µV (Slice 12)" },
  { key: "labels_auto", stream: "labels", sensor: "Algorithm · auto-detected gait segments" },
  { key: "label_corrections", stream: "label_corrections", sensor: "Algorithm + Rider · /sessions/[id]/review" },
  { key: "session_metrics", stream: "session_metrics", sensor: "Algorithm · HR/HRV/TRIMP/recovery τ (one row per session)" },
];

export function DataSourcesPanel({ counts }: { counts: SourceCounts }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-[var(--text-muted)]">Data sources</h2>
      <ul className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-sm">
        {SOURCE_ROWS.map((row) => {
          const count = counts[row.key];
          const empty = count === 0;
          return (
            <li key={row.key} className="grid grid-cols-12 items-center gap-3 p-3">
              <span className="col-span-3 font-mono text-xs text-[var(--text-muted)]">{row.stream}</span>
              <span className="col-span-7 text-xs text-[var(--text-faint)]">{row.sensor}</span>
              <span
                className={`col-span-2 text-right tabular-nums ${empty ? "text-[var(--text-faint)]" : ""}`}
              >
                {count.toLocaleString()} {empty ? "rows" : count === 1 ? "row" : "rows"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
