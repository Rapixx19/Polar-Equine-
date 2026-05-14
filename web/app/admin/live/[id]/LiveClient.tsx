"use client";

import { useEffect, useRef, useState } from "react";

import { EcgScope } from "./EcgScope";
import { HRLiveStrip } from "./HRLiveStrip";
import { AccSparkline } from "./AccSparkline";

const POLL_MS = 1000;
const HR_HISTORY_MS = 10 * 60 * 1000;

type HRPoint = { ts_ms: number; bpm: number; contact: boolean | null };
type EcgPoint = { ts_ms: number; uv: number };
type AccMagPoint = { ts_ms: number; m: number };

type LivePayload = {
  session: {
    status: string;
    start_time: string;
    end_time: string | null;
    last_ingest_at: string | null;
    rider: string | null;
    horse: string | null;
  };
  hr: { samples: HRPoint[]; cursor: number };
  ecg: { samples: EcgPoint[]; window_ms: number };
  acc: {
    magnitudes: AccMagPoint[];
    window_ms: number;
    gait: { label: string; stride_hz: number; confidence: number; algo_version: string } | null;
  };
  health: {
    hr_per_sec: number;
    acc_per_sec: number;
    ecg_per_sec: number;
    seconds_since_ingest: number | null;
    stale: boolean;
    latest_ts_ms: number;
  };
};

function fmtMs(ms: number): string {
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function LiveClient({ sessionId }: { sessionId: string }) {
  const [payload, setPayload] = useState<LivePayload | null>(null);
  const [hrHistory, setHrHistory] = useState<HRPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const url = `/api/admin/sessions/${sessionId}/live?hr_since_ms=${cursorRef.current}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`status_${res.status}`);
        const body = (await res.json()) as LivePayload;
        if (cancelled) return;
        setPayload(body);
        setError(null);
        cursorRef.current = body.hr.cursor;
        if (body.hr.samples.length > 0) {
          setHrHistory((prev) => {
            const merged = [...prev, ...body.hr.samples];
            const cutoff = body.health.latest_ts_ms - HR_HISTORY_MS;
            return merged.filter((p) => p.ts_ms >= cutoff);
          });
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }
    void poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sessionId]);

  if (!payload) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--text-faint)]">
        {error ? `Error: ${error}` : "Connecting…"}
      </div>
    );
  }

  const { session, ecg, acc, health } = payload;
  const latestHr = hrHistory.length > 0 ? hrHistory[hrHistory.length - 1] : null;
  const sessionMs = health.latest_ts_ms;
  const contactPct =
    hrHistory.length > 0
      ? Math.round(
          (hrHistory.filter((h) => h.contact === true).length / hrHistory.length) * 100,
        )
      : null;

  return (
    <div className="space-y-5">
      <div
        className={`flex items-center justify-between rounded-2xl border p-3 text-sm ${
          health.stale
            ? "border-rose-700/40 bg-rose-950/30 text-rose-300"
            : "border-emerald-700/40 bg-emerald-950/20 text-emerald-300"
        }`}
      >
        <span className="font-medium">
          {health.stale
            ? `Stale — no data for ${health.seconds_since_ingest ?? "∞"}s`
            : `Live · last ingest ${health.seconds_since_ingest ?? 0}s ago`}
        </span>
        <span className="tabular-nums text-xs text-[var(--text-muted)]">
          HR {health.hr_per_sec.toFixed(1)}/s · ACC {health.acc_per_sec.toFixed(0)}/s · ECG{" "}
          {health.ecg_per_sec.toFixed(0)}/s
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Heart rate" value={latestHr ? `${latestHr.bpm}` : "—"} unit="bpm" />
        <Tile
          label="Gait"
          value={acc.gait?.label ?? "—"}
          unit={acc.gait ? `${acc.gait.stride_hz.toFixed(2)} Hz` : ""}
          sub={acc.gait ? `confidence ${(acc.gait.confidence * 100).toFixed(0)}%` : null}
        />
        <Tile label="Duration" value={fmtMs(sessionMs)} unit="" />
        <Tile
          label="Strap contact"
          value={contactPct != null ? `${contactPct}` : "—"}
          unit="%"
        />
      </dl>

      <section>
        <h2 className="mb-2 text-sm font-medium text-[var(--text-muted)]">Heart rate · last 10 min</h2>
        <HRLiveStrip points={hrHistory} latestTs={health.latest_ts_ms} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-[var(--text-muted)]">
          ECG · last {(ecg.window_ms / 1000).toFixed(0)} s
        </h2>
        <EcgScope samples={ecg.samples} windowMs={ecg.window_ms} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-[var(--text-muted)]">
          Body acceleration · last {(acc.window_ms / 1000).toFixed(0)} s
        </h2>
        <AccSparkline magnitudes={acc.magnitudes} windowMs={acc.window_ms} />
      </section>

      <p className="text-xs text-[var(--text-faint)]">
        Polling every {(POLL_MS / 1000).toFixed(0)} s. Rider {session.rider ?? "—"} · horse{" "}
        {session.horse ?? "—"} · status {session.status}.
      </p>
    </div>
  );
}

function Tile({ label, value, unit, sub }: { label: string; value: string; unit: string; sub?: string | null }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <dt className="text-xs uppercase tracking-wide text-[var(--text-faint)]">{label}</dt>
      <dd className="mt-1 flex items-baseline gap-1 text-2xl font-light tabular-nums">
        <span>{value}</span>
        {unit ? <span className="text-sm text-[var(--text-muted)]">{unit}</span> : null}
      </dd>
      {sub ? <p className="mt-1 text-xs text-[var(--text-faint)]">{sub}</p> : null}
    </div>
  );
}
