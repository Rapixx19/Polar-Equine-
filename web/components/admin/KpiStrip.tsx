import type { DashboardKpis } from "@/lib/admin/dashboard-rollup";

function fmtPct(x: number | null): string {
  if (x == null || !Number.isFinite(x)) return "—";
  return `${Math.round(x * 100)}%`;
}

function fmtScore(x: number | null): string {
  if (x == null || !Number.isFinite(x)) return "—";
  return x.toFixed(2);
}

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">{label}</p>
      <p className="mt-1 text-2xl font-light text-[var(--text)] tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-[var(--text-faint)]">{hint}</p> : null}
    </div>
  );
}

export function KpiStrip({ kpis }: { kpis: DashboardKpis }) {
  return (
    <section
      className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
      aria-label="Study health KPIs"
    >
      <Tile label="Sessions" value={String(kpis.total_sessions)} hint={`${kpis.rider_count} riders`} />
      <Tile label="Ride hours" value={kpis.total_ride_hours.toFixed(1)} />
      <Tile
        label="Active (last 7d)"
        value={String(kpis.active_riders_7d)}
        hint={kpis.rider_count > 0 ? `of ${kpis.rider_count}` : undefined}
      />
      <Tile label="Prototype share" value={fmtPct(kpis.prototype_share)} />
      <Tile label="Avg quality" value={fmtScore(kpis.avg_quality)} hint="rr · hrv · workload" />
    </section>
  );
}
