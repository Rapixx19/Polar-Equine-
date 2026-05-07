import type { StudyRider } from "@/lib/admin/study-queries";

type Props = {
  rider: StudyRider;
  weeklyTarget: number;
  v0PhaseWeeks: number;
};

function fmtRel(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return iso;
  const days = Math.floor(ms / (24 * 3600 * 1000));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return weeks < 5 ? `${weeks}w ago` : `${Math.floor(days / 30)}mo ago`;
}

export function RiderStudyCard({ rider, weeklyTarget, v0PhaseWeeks }: Props) {
  const target = (rider.weekly_target_override ?? weeklyTarget) * v0PhaseWeeks;
  const pct = target > 0 ? Math.min(100, Math.round((rider.sessions_completed / target) * 100)) : 0;
  const qcLabel = rider.qc_pass_rate === null ? "—" : `${Math.round(rider.qc_pass_rate * 100)}%`;
  const meta = [
    rider.yard ?? null,
    rider.primary_discipline ?? null,
    rider.joined_week !== null ? `wk ${rider.joined_week}` : null,
  ].filter(Boolean).join(" · ");
  const label = rider.display_name?.trim() || `rider_${rider.id.slice(0, 8)}`;

  return (
    <article className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="truncate text-sm font-medium text-[var(--text)]">{label}</h2>
        {rider.flags_raised > 0 && (
          <span className="shrink-0 rounded-md bg-[var(--canvas)] px-2 py-0.5 text-xs text-[var(--red,#C45D52)]">
            {rider.flags_raised} flag{rider.flags_raised === 1 ? "" : "s"}
          </span>
        )}
      </header>
      <p className="mb-3 text-xs text-[var(--text-faint)]">{meta || "—"}</p>

      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-[var(--text-muted)]">Sessions</span>
        <span className="tabular-nums text-[var(--text)]">
          {rider.sessions_completed}<span className="text-[var(--text-faint)]"> / {target}</span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--canvas)]">
        <div className="h-full rounded-full bg-[var(--lime)]" style={{ width: `${pct}%` }} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-[var(--text-faint)]">QC pass</dt>
          <dd className="tabular-nums text-[var(--text-muted)]">{qcLabel}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-faint)]">Last session</dt>
          <dd className="text-[var(--text-muted)]">{fmtRel(rider.last_session)}</dd>
        </div>
      </dl>
    </article>
  );
}
