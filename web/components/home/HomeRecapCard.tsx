// Last-session recap card for the home page (Slice 11.8 Stage 3 state 2).
// Pulse icon + "Last · {relative}" + horse · activity + duration/HR meta.
// Wraps the whole card in a Link to the saved-session page so the rider can
// pull up the full recap with one tap. Matches mockup `lafattoria_d3_complete.html:246-254`.
import Link from "next/link";

export function HomeRecapCard({
  id,
  horseName,
  activityLabel,
  endedAtRelative,
  durationMin,
  hrAvg,
  hrPeak,
}: {
  id: string;
  horseName: string;
  activityLabel: string;
  endedAtRelative: string;
  durationMin: number | null;
  hrAvg: number | null;
  hrPeak: number | null;
}) {
  const metaParts: string[] = [];
  if (durationMin != null) metaParts.push(`${durationMin} min`);
  if (hrAvg != null) metaParts.push(`avg ${hrAvg}`);
  if (hrPeak != null) metaParts.push(`peak ${hrPeak}`);
  const meta = metaParts.join(" · ");

  return (
    <Link
      href={`/session/${id}/saved`}
      className="mb-6 flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:border-[var(--lime)]"
    >
      <span
        aria-hidden
        className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--canvas)] text-[var(--lime)]"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 fill-none stroke-current"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12l3-7 3 14 3-9 3 5h6" />
        </svg>
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs uppercase tracking-wide text-[var(--text-faint)]">
          Last · {endedAtRelative}
        </p>
        <p className="truncate text-sm font-medium text-[var(--text)]">
          {horseName} · {activityLabel}
        </p>
        {meta && <p className="text-xs text-[var(--text-muted)]">{meta}</p>}
      </div>
      <span aria-hidden className="text-lg text-[var(--text-faint)]">
        ›
      </span>
    </Link>
  );
}
