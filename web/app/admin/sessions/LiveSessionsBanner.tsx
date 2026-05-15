"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const POLL_MS = 3_000;

type ActiveRow = {
  id: string;
  activity_type: string;
  start_time: string;
  last_ingest_at: string | null;
  has_prototype_mount: boolean;
  rider_name: string | null;
  horse_name: string | null;
};

type LiveIndex = { active: ActiveRow[]; server_now: string };

function fmtElapsed(startMs: number, now: number): string {
  const s = Math.max(0, Math.floor((now - startMs) / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? `0${r}` : r}`;
}

function ageBucket(iso: string | null, now: number): { text: string; tone: "good" | "stale" | "lost" } {
  if (!iso) return { text: "no samples", tone: "lost" };
  const ageS = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  const text = ageS < 60 ? `${ageS}s ago` : `${Math.floor(ageS / 60)}m ago`;
  if (ageS < 5) return { text, tone: "good" };
  if (ageS < 30) return { text, tone: "stale" };
  return { text, tone: "lost" };
}

export function LiveSessionsBanner() {
  const [index, setIndex] = useState<LiveIndex | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const fetchOnce = async () => {
      try {
        const res = await fetch("/api/admin/live-sessions", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as LiveIndex;
        if (mountedRef.current) setIndex(data);
      } catch {
        // Transient network error — next tick will retry.
      }
    };
    fetchOnce();
    const id = setInterval(fetchOnce, POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, []);

  const rows = index?.active ?? null;
  if (rows == null || rows.length === 0) return null;

  const now = new Date(index!.server_now).getTime();

  return (
    <section className="mb-6 rounded-2xl border border-[var(--lime)]/60 bg-[var(--lime)]/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--lime)] opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--lime)]" />
        </span>
        <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--lime)]">
          Live now · {rows.length}
        </h2>
      </div>
      <ul className="space-y-2">
        {rows.map((r) => {
          const age = ageBucket(r.last_ingest_at, now);
          const ageColor =
            age.tone === "good"
              ? "text-[var(--lime)]"
              : age.tone === "stale"
                ? "text-amber-600"
                : "text-red-600";
          return (
            <li key={r.id}>
              <Link
                href={`/admin/sessions/${r.id}`}
                className="grid grid-cols-12 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm hover:border-[var(--lime)]"
              >
                <span className="col-span-3 truncate">{r.rider_name ?? "—"}</span>
                <span className="col-span-3 truncate">{r.horse_name ?? "—"}</span>
                <span className="col-span-2 truncate text-[var(--text-muted)]">{r.activity_type}</span>
                <span className="col-span-2 tabular-nums text-[var(--text-muted)]">
                  {fmtElapsed(new Date(r.start_time).getTime(), now)}
                </span>
                <span className={`col-span-2 text-right text-xs ${ageColor}`}>{age.text}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
