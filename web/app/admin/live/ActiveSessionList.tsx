"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { activityLabel } from "@/components/session/ActivityTile";
import type { ActivityType } from "@/lib/activities";

type ActiveSession = {
  id: string;
  rider: string | null;
  horse: string | null;
  activity_type: ActivityType;
  start_time: string;
  last_ingest_at: string | null;
  seconds_since_ingest: number | null;
  stale: boolean;
};

const REFRESH_MS = 5000;

function durationLabel(startIso: string): string {
  const ms = Date.now() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function ActiveSessionList() {
  const [sessions, setSessions] = useState<ActiveSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/admin/sessions/active", { cache: "no-store" });
        if (!res.ok) throw new Error(`status_${res.status}`);
        const body = (await res.json()) as { sessions: ActiveSession[] };
        if (!cancelled) {
          setSessions(body.sessions);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }
    void poll();
    const id = setInterval(poll, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (sessions === null && error === null) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--text-faint)]">
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-700/40 bg-rose-950/30 p-4 text-sm text-rose-300">
        Couldn&rsquo;t load active sessions: {error}
      </div>
    );
  }

  if ((sessions ?? []).length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--text-muted)]">
        No active sessions right now.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {(sessions ?? []).map((s) => (
        <li key={s.id}>
          <Link
            href={`/admin/live/${s.id}`}
            className="grid grid-cols-12 items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm transition hover:border-[var(--lime)]"
          >
            <span className="col-span-3 truncate font-medium">
              {s.rider ?? "—"}
            </span>
            <span className="col-span-3 truncate text-[var(--text-muted)]">
              {s.horse ?? "—"}
            </span>
            <span className="col-span-2 text-[var(--text-muted)]">
              {activityLabel(s.activity_type)}
            </span>
            <span className="col-span-2 tabular-nums text-[var(--text-muted)]">
              {durationLabel(s.start_time)}
            </span>
            <span
              className={`col-span-2 text-right text-xs tabular-nums ${
                s.stale ? "text-rose-400" : "text-emerald-400"
              }`}
            >
              {s.stale ? "stale" : "live"}
              {s.seconds_since_ingest != null ? ` · ${s.seconds_since_ingest}s` : ""}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
