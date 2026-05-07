import type { AllocationTally, AllocationTarget } from "@/lib/admin/study-queries";

type Props = {
  targets: AllocationTarget[];
  tallies: AllocationTally[];
  totalTargetSessions: number;
};

const EMPHASIS_LABEL: Record<AllocationTarget["emphasis"], string> = {
  foundation: "foundation",
  "state-rich": "state-rich",
  specialized: "specialized",
  core: "core",
};

export function AllocationTable({ targets, tallies, totalTargetSessions }: Props) {
  const tallyMap = new Map(tallies.map((t) => [t.label, t.count]));
  const unmapped = tallyMap.get("Unmapped") ?? 0;
  const totalActual = tallies.reduce((acc, t) => acc + t.count, 0);

  return (
    <div className="overflow-x-auto rounded-md border border-[var(--border)]">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-[var(--surface)] text-xs uppercase tracking-wide text-[var(--text-faint)]">
          <tr>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Label</th>
            <th className="px-3 py-2">Emphasis</th>
            <th className="px-3 py-2 text-right">Target %</th>
            <th className="px-3 py-2 text-right">Target #</th>
            <th className="px-3 py-2 text-right">Actual</th>
            <th className="px-3 py-2 text-right">Gap</th>
          </tr>
        </thead>
        <tbody>
          {targets.map((t) => {
            const targetCount = Math.round((totalTargetSessions * t.pct) / 100);
            const actual = tallyMap.get(t.type) ?? 0;
            const gap = actual - targetCount;
            return (
              <tr key={t.type} className="border-t border-[var(--border)]">
                <td className="px-3 py-2">
                  <span
                    className="inline-flex items-center gap-2 text-[var(--text)]"
                    title={t.color}
                  >
                    <span
                      aria-hidden
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: t.color }}
                    />
                    {t.type}
                  </span>
                </td>
                <td className="px-3 py-2 text-[var(--text-muted)]">{t.label}</td>
                <td className="px-3 py-2 text-xs uppercase tracking-wide text-[var(--text-faint)]">
                  {EMPHASIS_LABEL[t.emphasis]}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">
                  {t.pct}%
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">
                  {targetCount}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text)]">
                  {actual}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    gap >= 0 ? "text-[var(--lime)]" : "text-[var(--text-muted)]"
                  }`}
                >
                  {gap >= 0 ? `+${gap}` : gap}
                </td>
              </tr>
            );
          })}
          {unmapped > 0 && (
            <tr className="border-t border-[var(--border)] bg-[var(--surface)]">
              <td className="px-3 py-2 text-[var(--text-muted)]">Unmapped</td>
              <td className="px-3 py-2 text-xs text-[var(--text-faint)]" colSpan={4}>
                Sessions whose activity_type / riding_subtype don&rsquo;t fit any of the 9 categories.
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">
                {unmapped}
              </td>
              <td className="px-3 py-2"></td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-[var(--border)] bg-[var(--surface)] text-xs uppercase tracking-wide text-[var(--text-faint)]">
            <td className="px-3 py-2" colSpan={4}>
              Total
            </td>
            <td className="px-3 py-2 text-right tabular-nums">{totalTargetSessions}</td>
            <td className="px-3 py-2 text-right tabular-nums">{totalActual}</td>
            <td className="px-3 py-2"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
