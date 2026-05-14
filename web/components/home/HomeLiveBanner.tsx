// Active-session banner for the home page.
// Locked decision: server-rendered relative time, no live timer ticking — the
// real-time numbers live on the recording page. The "End now" button is a
// client subcomponent so the rider can clean up an orphan session right from
// home (laptop closed, browser killed, etc.) without waiting for the 12h
// abandon-stale cron. `looksStuck` is computed server-side in
// fetchHomeSummary against the same `now` used for the relative time.
import Link from "next/link";

import { EndStaleSessionButton } from "./EndStaleSessionButton";

export function HomeLiveBanner({
  id,
  horseName,
  activityLabel,
  startedAtRelative,
  looksStuck,
}: {
  id: string;
  horseName: string;
  activityLabel: string;
  startedAtRelative: string;
  looksStuck: boolean;
}) {
  return (
    <div
      className={`mb-6 rounded-2xl border bg-[var(--surface)] p-4 ${
        looksStuck ? "border-amber-500/50" : "border-[var(--lime)]"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="relative flex h-3 w-3 items-center justify-center"
        >
          {!looksStuck && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--lime)] opacity-60" />
          )}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${
              looksStuck ? "bg-amber-500" : "bg-[var(--lime)]"
            }`}
          />
        </span>
        <Link href={`/session/${id}`} className="flex-1 min-w-0">
          <p
            className={`text-xs uppercase tracking-wide ${
              looksStuck ? "text-amber-600" : "text-[var(--lime)]"
            }`}
          >
            {looksStuck ? "Looks stuck" : "Recording now"}
          </p>
          <p className="truncate text-sm font-medium text-[var(--text)]">
            {horseName} · {activityLabel}
          </p>
        </Link>
        <div className="flex flex-col items-end gap-2">
          <span className="font-mono text-xs text-[var(--text-muted)]">
            Started {startedAtRelative}
          </span>
          <EndStaleSessionButton id={id} variant={looksStuck ? "warn" : "subtle"} />
        </div>
      </div>
      {looksStuck && (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          No samples have arrived in over a minute. Tap <strong>End now</strong> to close this session, or open it to keep recording.
        </p>
      )}
    </div>
  );
}
