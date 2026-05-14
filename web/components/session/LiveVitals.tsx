"use client";

import { useEffect, useState } from "react";

import type { HRSample } from "@/lib/ble/hr-codec";
import type { PmdLifecycleEvent } from "@/lib/ble/pmd-service";
import type { StreamStats } from "@/lib/ble/use-ingest-session";

type Props = {
  sample?: HRSample;
  streams: StreamStats;
  startedAt: number | null;
  pmdEnabled: boolean;
  pmdEvents: Array<PmdLifecycleEvent & { at: number }>;
};

// A stream is "live" when its last sample arrived within this many ms.
// HR fires ~1 Hz so the budget is loose; ACC at 200 Hz and ECG at 130 Hz
// would normally be a few ms apart — anything older than 2 s means the
// stream stalled.
const LIVE_BUDGET_MS = 2500;
// PMD streams may take up to ~3 s after start before the H10 emits the
// first frame. Below this we show "starting…" instead of "stalled".
const STARTING_BUDGET_MS = 4000;

export function LiveVitals({
  sample,
  streams,
  startedAt,
  pmdEnabled,
  pmdEvents,
}: Props) {
  const now = useNow(500);
  const bpm = sample?.hr_bpm ?? 0;
  const hrStatus = streamStatus(streams.hr, startedAt, now, true);
  const accStatus = streamStatus(streams.acc, startedAt, now, pmdEnabled);
  const ecgStatus = streamStatus(streams.ecg, startedAt, now, pmdEnabled);

  const requiredStreams = pmdEnabled
    ? [hrStatus, accStatus, ecgStatus]
    : [hrStatus];
  const allLive = requiredStreams.every((s) => s === "live");

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="flex items-center gap-5">
          <Heart bpm={bpm} active={hrStatus === "live"} />
          <div className="flex-1">
            <p className="text-xs uppercase tracking-wide text-[var(--text-faint)]">
              Heart rate
            </p>
            <p className="mt-0.5 text-6xl font-light leading-none tabular-nums">
              {bpm > 0 ? bpm : "--"}
              <span className="ml-2 align-baseline text-base text-[var(--text-faint)]">
                bpm
              </span>
            </p>
            <div className="mt-3 flex items-center gap-3 text-xs text-[var(--text-muted)]">
              <ElapsedChip startedAt={startedAt} now={now} />
              {sample?.contact && (
                <span className="text-[var(--text-faint)]">
                  contact: {sample.contact}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StreamCard label="HR" hz={1} status={hrStatus} count={streams.hr.count} />
        <StreamCard
          label="ACC"
          hz={200}
          status={accStatus}
          count={streams.acc.count}
        />
        <StreamCard
          label="ECG"
          hz={130}
          status={ecgStatus}
          count={streams.ecg.count}
        />
      </div>

      <ConfirmationBanner allLive={allLive} pmdEnabled={pmdEnabled} />

      {pmdEnabled && (accStatus !== "live" || ecgStatus !== "live") && (
        <PmdDiagnostics events={pmdEvents} accStatus={accStatus} ecgStatus={ecgStatus} />
      )}
    </div>
  );
}

function PmdDiagnostics({
  events,
  accStatus,
  ecgStatus,
}: {
  events: Array<PmdLifecycleEvent & { at: number }>;
  accStatus: StreamState;
  ecgStatus: StreamState;
}) {
  const summary = summariseEvents(events, accStatus, ecgStatus);
  return (
    <details className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-[var(--text-muted)]">
      <summary className="cursor-pointer font-medium text-amber-700">
        ⚠ {summary}
      </summary>
      <ul className="mt-2 space-y-1 font-mono">
        {events.length === 0 && (
          <li className="text-[var(--text-faint)]">
            No PMD lifecycle events yet — the start command may not have run.
            If you just paired, make sure you went through the picker (not just
            a cached reconnect) so the browser grants PMD access.
          </li>
        )}
        {events.map((e, i) => (
          <li key={i}>{formatEvent(e)}</li>
        ))}
      </ul>
    </details>
  );
}

function summariseEvents(
  events: Array<PmdLifecycleEvent & { at: number }>,
  accStatus: StreamState,
  ecgStatus: StreamState,
): string {
  const blocked = events.find((e) => e.kind === "service_blocked");
  if (blocked) return "PMD service blocked by browser — re-pair the band";
  const accFail = events.find((e) => e.kind === "acc_start_failed");
  const ecgFail = events.find((e) => e.kind === "ecg_start_failed");
  const accReject = events.find(
    (e) => e.kind === "ack" && e.stream === 0x02 && e.err_code !== 0,
  );
  const ecgReject = events.find(
    (e) => e.kind === "ack" && e.stream === 0x00 && e.err_code !== 0,
  );
  if (accFail || ecgFail) return "H10 refused one or more start commands";
  if (accReject || ecgReject) return "H10 rejected stream parameters";
  if (accStatus !== "live" || ecgStatus !== "live") {
    return "Streams not flowing yet — tap to see diagnostics";
  }
  return "Diagnostics";
}

function formatEvent(e: PmdLifecycleEvent & { at: number }): string {
  const ts = new Date(e.at).toISOString().slice(11, 23);
  switch (e.kind) {
    case "service_blocked":
      return `${ts} service_blocked: ${e.message}`;
    case "acc_start_failed":
      return `${ts} acc_start_failed: ${e.message}`;
    case "ecg_start_failed":
      return `${ts} ecg_start_failed: ${e.message}`;
    case "ack": {
      const streamName = e.stream === 0x00 ? "ECG" : e.stream === 0x02 ? "ACC" : `0x${e.stream.toString(16)}`;
      const ok = e.err_code === 0 ? "ok" : `ERR 0x${e.err_code.toString(16)}`;
      return `${ts} ack ${streamName} → ${ok}`;
    }
  }
}

type StreamState = "waiting" | "starting" | "live" | "stalled" | "disabled";

function streamStatus(
  stat: { count: number; lastAt: number | null },
  startedAt: number | null,
  now: number,
  enabled: boolean,
): StreamState {
  if (!enabled) return "disabled";
  if (stat.lastAt && now - stat.lastAt < LIVE_BUDGET_MS) return "live";
  if (stat.count === 0 && startedAt && now - startedAt < STARTING_BUDGET_MS) {
    return "starting";
  }
  if (stat.count === 0) return "waiting";
  return "stalled";
}

function StreamCard({
  label,
  hz,
  status,
  count,
}: {
  label: string;
  hz: number;
  status: StreamState;
  count: number;
}) {
  const colour = statusColour(status);
  return (
    <div
      data-state={status}
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
          {label}
        </span>
        <Dot colour={colour} pulse={status === "live"} />
      </div>
      <p className="mt-1 text-xl font-light tabular-nums">
        {count.toLocaleString()}
      </p>
      <p className="text-[10px] text-[var(--text-faint)]">
        {statusLabel(status)} · {hz} Hz
      </p>
    </div>
  );
}

function ConfirmationBanner({
  allLive,
  pmdEnabled,
}: {
  allLive: boolean;
  pmdEnabled: boolean;
}) {
  if (!allLive) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-xl border border-[var(--lime)]/40 bg-[var(--lime)]/10 px-3 py-2 text-sm text-[var(--lime)]"
    >
      <span aria-hidden className="text-lg">
        ✓
      </span>
      <span className="font-medium">
        {pmdEnabled
          ? "All streams live — HR, ACC and ECG flowing."
          : "HR streaming."}
      </span>
    </div>
  );
}

function Heart({ bpm, active }: { bpm: number; active: boolean }) {
  // CSS animation duration matches one cardiac cycle. Falls back to a
  // slow pulse when bpm is unknown.
  const period = bpm > 0 ? 60 / bpm : 1.2;
  return (
    <div className="relative h-16 w-16 shrink-0">
      <style>{`
        @keyframes pq-pulse {
          0%   { transform: scale(1);   opacity: 1; }
          18%  { transform: scale(1.18); opacity: 1; }
          40%  { transform: scale(1);   opacity: 0.95; }
          100% { transform: scale(1);   opacity: 1; }
        }
        @keyframes pq-ring {
          0%   { transform: scale(1);   opacity: 0.55; }
          100% { transform: scale(1.7); opacity: 0;    }
        }
      `}</style>
      {active && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border-2 border-[var(--red)]"
          style={{
            animation: `pq-ring ${period}s ease-out infinite`,
          }}
        />
      )}
      <svg
        viewBox="0 0 24 24"
        className="absolute inset-0 m-auto h-12 w-12"
        style={{
          color: "var(--red)",
          animation: active ? `pq-pulse ${period}s ease-in-out infinite` : undefined,
          transformOrigin: "center",
        }}
        fill="currentColor"
        aria-hidden
      >
        <path d="M12 21s-7.5-4.6-9.6-9.1C.9 8.1 3 4 6.7 4c2 0 3.4 1.1 4.3 2.4l1 1.3 1-1.3C13.9 5.1 15.3 4 17.3 4 21 4 23.1 8.1 21.6 11.9 19.5 16.4 12 21 12 21z" />
      </svg>
    </div>
  );
}

function Dot({ colour, pulse }: { colour: string; pulse: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2 items-center justify-center">
      {pulse && (
        <span
          aria-hidden
          className="absolute inline-flex h-2 w-2 animate-ping rounded-full opacity-60"
          style={{ background: colour }}
        />
      )}
      <span
        aria-hidden
        className="relative inline-flex h-2 w-2 rounded-full"
        style={{ background: colour }}
      />
    </span>
  );
}

function ElapsedChip({
  startedAt,
  now,
}: {
  startedAt: number | null;
  now: number;
}) {
  if (!startedAt) return null;
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const mm = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const ss = (seconds % 60).toString().padStart(2, "0");
  return (
    <span className="font-mono tabular-nums text-[var(--text)]">
      {mm}:{ss}
    </span>
  );
}

function statusColour(state: StreamState): string {
  switch (state) {
    case "live":
      return "var(--lime)";
    case "starting":
      return "var(--zone-4)";
    case "stalled":
      return "var(--red)";
    case "waiting":
      return "var(--text-faint)";
    case "disabled":
      return "var(--border)";
  }
}

function statusLabel(state: StreamState): string {
  switch (state) {
    case "live":
      return "live";
    case "starting":
      return "starting…";
    case "stalled":
      return "stalled";
    case "waiting":
      return "waiting";
    case "disabled":
      return "off";
  }
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
