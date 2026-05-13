import type { ProgressContext } from "@/lib/research/fetch-progress";
import { phraseProgress } from "@/lib/research/gap-analyzer";

export function ResearchProgress({ ctx }: { ctx: ProgressContext }) {
  const { report, daysRemaining } = ctx;
  const pct = Math.min(
    100,
    Math.round((report.sessionsApproved / Math.max(1, report.sessionsTarget)) * 100),
  );
  const reached = report.sessionsApproved >= report.sessionsTarget;

  return (
    <section className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="mb-2 text-xs uppercase tracking-wide text-[var(--lime)]">
        Research progress
      </p>
      <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-[var(--canvas)]">
        <div
          className="h-full rounded-full bg-[var(--lime)] transition-all"
          style={{ width: `${pct}%` }}
          aria-hidden
        />
      </div>
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-[var(--text)]">{phraseProgress(report)}</p>
        <p className="text-xs text-[var(--text-faint)]">
          {reached ? "Target reached" : `${report.sessionsRemaining} to go`}
          {daysRemaining != null && !reached ? ` · ${daysRemaining} days left` : ""}
        </p>
      </div>
    </section>
  );
}
