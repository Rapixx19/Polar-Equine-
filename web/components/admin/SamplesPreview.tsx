type Sample = {
  id: number;
  timestamp_ms: number;
  hr_bpm: number | null;
  rr_ms: number | null;
  contact: boolean | null;
};

type Props = {
  samples: Sample[];
  total: number;
};

function fmtTOffset(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function SamplesPreview({ samples, total }: Props) {
  if (total === 0) {
    return (
      <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-muted)]">
        No HR samples ingested for this session.
      </div>
    );
  }
  return (
    <div>
      <div className="overflow-x-auto rounded-md border border-[var(--border)]">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="bg-[var(--surface)] text-xs uppercase tracking-wide text-[var(--text-faint)]">
            <tr>
              <th className="px-3 py-2">t</th>
              <th className="px-3 py-2">HR</th>
              <th className="px-3 py-2">RR</th>
              <th className="px-3 py-2">Contact</th>
            </tr>
          </thead>
          <tbody>
            {samples.map((s) => (
              <tr key={s.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-1.5 tabular-nums text-[var(--text-muted)]">{fmtTOffset(s.timestamp_ms)}</td>
                <td className="px-3 py-1.5 tabular-nums">{s.hr_bpm ?? "—"}</td>
                <td className="px-3 py-1.5 tabular-nums text-[var(--text-muted)]">{s.rr_ms ?? "—"}</td>
                <td className="px-3 py-1.5 text-[var(--text-muted)]">
                  {s.contact === true ? "yes" : s.contact === false ? "no" : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-[var(--text-faint)]">
        Showing first {samples.length} of {total} HR samples. Full data via Supabase Studio.
      </p>
    </div>
  );
}
