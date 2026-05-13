import type { ProgressContext } from "@/lib/research/fetch-progress";
import { phraseGap } from "@/lib/research/gap-analyzer";

const TOP_N = 3;

export function NextNeeded({ ctx }: { ctx: ProgressContext }) {
  const top = ctx.report.gaps.slice(0, TOP_N);
  if (top.length === 0 && ctx.report.horsesSampled >= 2) return null;

  return (
    <section className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-faint)]">
        Next needed
      </p>
      <ul className="space-y-1.5 text-sm text-[var(--text)]">
        {top.map((g) => (
          <li key={g.label} className="flex items-baseline gap-2">
            <span aria-hidden className="text-[var(--lime)]">·</span>
            <span>{phraseGap(g)}</span>
          </li>
        ))}
        {ctx.report.horsesSampled < 2 ? (
          <li className="flex items-baseline gap-2">
            <span aria-hidden className="text-[var(--lime)]">·</span>
            <span>Try a session with a different horse</span>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
