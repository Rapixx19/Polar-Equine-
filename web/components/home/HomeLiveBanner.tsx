// Active-session banner for the home page (Slice 11.8 Stage 3 state 3).
// Live dot + "Recording now" + horse · activity + "Started Xh ago".
// Locked decision: server-rendered relative time, no live timer ticking — the
// real-time numbers live on the recording page. Matches mockup
// `lafattoria_d3_complete.html:284-288` minus the ticking timer.
import Link from "next/link";

export function HomeLiveBanner({
  id,
  horseName,
  activityLabel,
  startedAtRelative,
}: {
  id: string;
  horseName: string;
  activityLabel: string;
  startedAtRelative: string;
}) {
  return (
    <Link
      href={`/session/${id}`}
      className="mb-6 flex items-center gap-3 rounded-2xl border border-[var(--lime)] bg-[var(--surface)] p-4 transition hover:bg-[var(--canvas)]"
    >
      <span
        aria-hidden
        className="relative flex h-3 w-3 items-center justify-center"
      >
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--lime)] opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--lime)]" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs uppercase tracking-wide text-[var(--lime)]">Recording now</p>
        <p className="truncate text-sm font-medium text-[var(--text)]">
          {horseName} · {activityLabel}
        </p>
      </div>
      <span className="font-mono text-xs text-[var(--text-muted)]">
        Started {startedAtRelative}
      </span>
    </Link>
  );
}
