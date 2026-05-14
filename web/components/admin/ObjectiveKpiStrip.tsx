import type { HorseKpis } from "@/lib/admin/horse-rollup";

function fmtPct(x: number | null): string {
  if (x == null || !Number.isFinite(x)) return "—";
  return `${Math.round(x * 100)}%`;
}

function ObjectiveTile({
  label,
  pct,
  hint,
}: {
  label: string;
  pct: number | null;
  hint: string;
}) {
  const pctClamped = pct == null ? null : Math.min(1, Math.max(0, pct));
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">{label}</p>
      <p className="mt-1 text-2xl font-light text-[var(--text)] tabular-nums">{fmtPct(pct)}</p>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className="h-full bg-[var(--lime)]"
          style={{ width: pctClamped != null ? `${pctClamped * 100}%` : "0%" }}
        />
      </div>
      <p className="mt-1 text-[10px] text-[var(--text-faint)]">{hint}</p>
    </div>
  );
}

export function ObjectiveKpiStrip({ kpis }: { kpis: HorseKpis }) {
  // Don't render the strip if nobody has set any objectives yet — the page
  // already has KPI tiles above, no need to clutter with two "—" tiles.
  if (kpis.horses_with_objectives === 0) return null;
  return (
    <section
      className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      aria-label="Research objective progress"
    >
      <ObjectiveTile
        label="Sessions goal"
        pct={kpis.session_progress}
        hint={`Across ${kpis.horses_with_objectives} of ${kpis.horse_count} horses`}
      />
      <ObjectiveTile
        label="Minutes goal"
        pct={kpis.minutes_progress}
        hint="Capped per horse so laggards stay visible"
      />
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-transparent p-4">
        <p className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">Objectives set</p>
        <p className="mt-1 text-2xl font-light text-[var(--text)] tabular-nums">
          {kpis.horses_with_objectives}
          <span className="text-base text-[var(--text-faint)]">/{kpis.horse_count}</span>
        </p>
        <p className="mt-1 text-[10px] text-[var(--text-faint)]">
          Horses with at least one target set
        </p>
      </div>
    </section>
  );
}
