"use client";

import { useEffect, useRef, useState } from "react";

const POLL_MS = 3_000;

type LiveSnapshot = {
  status: string;
  start_time: string;
  end_time: string | null;
  last_ingest_at: string | null;
  sample_counts: { hr: number; acc: number; ecg: number };
  latest_hr: { ts_ms: number; bpm: number } | null;
  recent_hr: Array<{ ts_ms: number; bpm: number }>;
  server_now: string;
};

function fmtElapsed(startMs: number, now: number): string {
  const s = Math.max(0, Math.floor((now - startMs) / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? `0${r}` : r}`;
}

function fmtAge(iso: string | null, now: number): { text: string; tone: "good" | "stale" | "lost" } {
  if (!iso) return { text: "no data yet", tone: "lost" };
  const ageS = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  const text = ageS < 60 ? `${ageS}s ago` : `${Math.floor(ageS / 60)}m ${ageS % 60}s ago`;
  if (ageS < 5) return { text, tone: "good" };
  if (ageS < 30) return { text, tone: "stale" };
  return { text, tone: "lost" };
}

function Sparkline({ data }: { data: Array<{ bpm: number }> }) {
  if (data.length < 2) return <div className="h-10 w-full" />;
  const bpms = data.map((d) => d.bpm).filter((b) => b > 0);
  if (bpms.length < 2) return <div className="h-10 w-full" />;
  const lo = Math.min(...bpms);
  const hi = Math.max(...bpms);
  const range = Math.max(1, hi - lo);
  const w = 200;
  const h = 40;
  const step = w / (data.length - 1);
  const pts = data
    .map((d, i) => `${(i * step).toFixed(1)},${(h - ((d.bpm - lo) / range) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-10 w-full" preserveAspectRatio="none">
      <polyline fill="none" stroke="var(--lime)" strokeWidth={1.5} points={pts} />
    </svg>
  );
}

export function LiveStatusBar({
  sessionId,
  initialStatus,
}: {
  sessionId: string;
  initialStatus: string;
}) {
  const [snap, setSnap] = useState<LiveSnapshot | null>(null);
  const stoppedRef = useRef(initialStatus !== "active");

  useEffect(() => {
    if (stoppedRef.current) return;
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const res = await fetch(`/api/admin/sessions/${sessionId}/live`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as LiveSnapshot;
        if (cancelled) return;
        setSnap(data);
        if (data.status !== "active") stoppedRef.current = true;
      } catch {
        // Transient network error — next tick will retry.
      }
    };
    fetchOnce();
    const id = setInterval(() => {
      if (stoppedRef.current) return;
      fetchOnce();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sessionId]);

  if (initialStatus !== "active" && !snap) return null;

  const liveStatus = snap?.status ?? initialStatus;
  const isLive = liveStatus === "active";
  const serverNow = snap ? new Date(snap.server_now).getTime() : 0;
  const elapsed = snap ? fmtElapsed(new Date(snap.start_time).getTime(), serverNow) : "—";
  const age = fmtAge(snap?.last_ingest_at ?? null, serverNow);
  const ageColor =
    age.tone === "good" ? "text-[var(--lime)]" : age.tone === "stale" ? "text-amber-600" : "text-red-600";

  return (
    <section
      className={`mb-6 rounded-2xl border p-4 ${
        isLive ? "border-[var(--lime)]/60 bg-[var(--lime)]/5" : "border-[var(--border)] bg-[var(--surface)]"
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          {isLive ? (
            <span className="inline-flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--lime)] opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--lime)]" />
              </span>
              <span className="font-medium uppercase tracking-wide text-[var(--lime)]">Live · {elapsed}</span>
            </span>
          ) : (
            <span className="text-[var(--text-muted)]">Recording ended</span>
          )}
        </div>
        <div className={`text-xs ${ageColor}`}>{isLive ? `Last sample ${age.text}` : null}</div>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--text-faint)]">HR samples</p>
          <p className="tabular-nums text-lg">{(snap?.sample_counts.hr ?? 0).toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--text-faint)]">ACC samples</p>
          <p className="tabular-nums text-lg">{(snap?.sample_counts.acc ?? 0).toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--text-faint)]">ECG samples</p>
          <p className="tabular-nums text-lg">{(snap?.sample_counts.ecg ?? 0).toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--text-faint)]">Latest HR</p>
          <p className="tabular-nums text-lg">
            {snap?.latest_hr ? `${Math.round(snap.latest_hr.bpm)} bpm` : "—"}
          </p>
        </div>
      </div>
      <div className="mt-3">
        <Sparkline data={snap?.recent_hr ?? []} />
      </div>
    </section>
  );
}
