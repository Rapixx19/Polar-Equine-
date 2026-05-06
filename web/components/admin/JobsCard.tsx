type Props = {
  jobs: Array<Record<string, unknown>>;
};

function fmtDate(v: unknown): string {
  if (typeof v !== "string" || !v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.valueOf())) return v;
  return d.toLocaleString();
}

export function JobsCard({ jobs }: Props) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-muted)]">
        No compute jobs for this session.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border border-[var(--border)]">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-[var(--surface)] text-xs uppercase tracking-wide text-[var(--text-faint)]">
          <tr>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Attempts</th>
            <th className="px-3 py-2">Last error</th>
            <th className="px-3 py-2">Next run</th>
            <th className="px-3 py-2">Created</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={(j.id as string) ?? `${j.session_id}-${j.created_at}`} className="border-t border-[var(--border)]">
              <td className="px-3 py-2">{(j.job_type as string) ?? "—"}</td>
              <td className="px-3 py-2 text-[var(--text-muted)]">{(j.status as string) ?? "—"}</td>
              <td className="px-3 py-2 tabular-nums">{(j.attempts as number) ?? 0}</td>
              <td className="px-3 py-2 text-[var(--text-muted)]" title={(j.last_error as string) ?? ""}>
                {((j.last_error as string) ?? "").slice(0, 60) || "—"}
              </td>
              <td className="px-3 py-2 text-[var(--text-muted)]">{fmtDate(j.next_run_at)}</td>
              <td className="px-3 py-2 text-[var(--text-muted)]">{fmtDate(j.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
