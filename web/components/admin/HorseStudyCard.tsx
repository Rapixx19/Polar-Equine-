import type { StudyHorse } from "@/lib/admin/study-queries";

const LEVEL_LABEL: Record<string, string> = {
  "high-performance": "high-perf",
  "mid-level": "mid",
  returning: "returning",
  young: "young",
};

export function HorseStudyCard({ horse }: { horse: StudyHorse }) {
  const meta = [
    horse.age_years !== null ? `${horse.age_years}y` : null,
    horse.sex,
    horse.discipline,
  ].filter(Boolean).join(" · ");

  return (
    <article className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="truncate text-sm font-medium text-[var(--text)]">{horse.name}</h2>
        {horse.is_holdout && (
          <span className="shrink-0 rounded-md bg-[var(--canvas)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
            holdout
          </span>
        )}
      </header>
      <p className="mb-3 text-xs text-[var(--text-faint)]">{meta || "—"}</p>

      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-[var(--text-faint)]">Level</dt>
          <dd className="text-[var(--text-muted)]">
            {horse.level ? LEVEL_LABEL[horse.level] ?? horse.level : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--text-faint)]">Sessions</dt>
          <dd className="tabular-nums text-[var(--text-muted)]">{horse.sessions_completed}</dd>
        </div>
        {horse.advisory_weekly_cap_override !== null && (
          <div className="col-span-2">
            <dt className="text-[var(--text-faint)]">Weekly cap</dt>
            <dd className="text-[var(--text-muted)]">{horse.advisory_weekly_cap_override}/wk</dd>
          </div>
        )}
      </dl>
    </article>
  );
}
