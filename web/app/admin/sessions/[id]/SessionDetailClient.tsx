"use client";

import { useMemo, useState } from "react";

import { HRChart } from "@/components/session/HRChart";
import type { GaitLabel } from "@/lib/session/segments";

import { DataSourcesPanel, type SourceCounts } from "./DataSourcesPanel";
import { ExportsPanel } from "./ExportsPanel";
import { InsightPanel } from "./InsightPanel";
import { LiveStatusBar } from "./LiveStatusBar";

export type { SourceCounts };

type InitialInsight = {
  markdown: string;
  model: string;
  prompt_version: string;
  input_tokens: number;
  output_tokens: number;
  generated_at: string;
  cached: boolean;
};

type Sample = { ts_ms: number; bpm: number };
type Label = {
  start_ms: number;
  end_ms: number;
  label: GaitLabel;
  jump_count: number;
  correction_kind: string;
};
type SignalEvent = { kind: "weak" | "lost"; t_start_ms: number; t_end_ms: number };

const MAX_CHART_POINTS = 500;

function downsample(samples: Sample[]): Sample[] {
  if (samples.length <= MAX_CHART_POINTS) return samples;
  const stride = Math.ceil(samples.length / MAX_CHART_POINTS);
  return samples.filter((_, i) => i % stride === 0);
}

function fmtRange(startMs: number, endMs: number): string {
  const f = (ms: number) => {
    const total = Math.round(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s < 10 ? `0${s}` : s}`;
  };
  return `${f(startMs)}–${f(endMs)}`;
}

const METRIC_ROWS: Array<{ key: string; label: string; unit?: string; digits?: number }> = [
  { key: "hr_avg", label: "HR avg", unit: "bpm", digits: 0 },
  { key: "hr_peak", label: "HR peak", unit: "bpm", digits: 0 },
  { key: "hr_min", label: "HR min", unit: "bpm", digits: 0 },
  { key: "rmssd_ms", label: "RMSSD", unit: "ms", digits: 1 },
  { key: "sdnn_ms", label: "SDNN", unit: "ms", digits: 1 },
  { key: "pnn50_pct", label: "pNN50", unit: "%", digits: 1 },
  { key: "trimp_banister", label: "TRIMP", digits: 1 },
  { key: "recovery_tau_s", label: "Recovery τ", unit: "s", digits: 0 },
  { key: "jump_count", label: "Jumps", digits: 0 },
];

function fmtMetric(v: unknown, digits = 1): string {
  if (v == null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return digits === 0 ? Math.round(n).toString() : n.toFixed(digits);
}

type SignalSummary = {
  lostCount: number;
  weakCount: number;
  badMs: number;
  cleanPct: number | null;
};

function summarizeSignal(events: SignalEvent[], durationMs: number | undefined): SignalSummary {
  let lostCount = 0;
  let weakCount = 0;
  let badMs = 0;
  for (const e of events) {
    const span = Math.max(0, e.t_end_ms - e.t_start_ms);
    badMs += span;
    if (e.kind === "lost") lostCount += 1;
    else weakCount += 1;
  }
  const cleanPct =
    durationMs && durationMs > 0
      ? Math.max(0, Math.min(100, ((durationMs - badMs) / durationMs) * 100))
      : null;
  return { lostCount, weakCount, badMs, cleanPct };
}

function cleanTone(pct: number): { label: string; classes: string } {
  if (pct >= 80) return { label: "Good", classes: "bg-[var(--lime)]/15 text-[var(--lime)]" };
  if (pct >= 50) return { label: "Mixed", classes: "bg-amber-500/15 text-amber-700" };
  return { label: "Poor", classes: "bg-[var(--red)]/15 text-[var(--red)]" };
}

export function SessionDetailClient({
  sessionId,
  samples,
  labels,
  metrics,
  durationMs,
  initialInsight,
  sourceCounts,
  signalEvents,
  initialStatus,
}: {
  sessionId: string;
  samples: Sample[];
  labels: Label[];
  metrics: Record<string, unknown> | null;
  durationMs?: number;
  initialInsight: InitialInsight | null;
  sourceCounts: SourceCounts;
  signalEvents: SignalEvent[];
  initialStatus: string;
}) {
  const chartSamples = useMemo(() => downsample(samples), [samples]);
  const segments = useMemo(
    () => labels.map((l) => ({ start_ms: l.start_ms, end_ms: l.end_ms, label: l.label })),
    [labels],
  );
  const signalSummary = useMemo(
    () => summarizeSignal(signalEvents, durationMs),
    [signalEvents, durationMs],
  );
  const [signalExpanded, setSignalExpanded] = useState(false);

  return (
    <div className="space-y-6">
      <LiveStatusBar sessionId={sessionId} initialStatus={initialStatus} />
      <section>
        <h2 className="mb-2 text-sm font-medium text-[var(--text-muted)]">Heart rate</h2>
        <HRChart
          samples={chartSamples}
          segments={segments}
          signalEvents={signalEvents}
          durationMs={durationMs}
          height={260}
        />
      </section>

      {signalEvents.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-[var(--text-muted)]">Signal quality</h2>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {signalSummary.cleanPct !== null ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${cleanTone(signalSummary.cleanPct).classes}`}
                  >
                    {cleanTone(signalSummary.cleanPct).label} · {signalSummary.cleanPct.toFixed(0)}% clean
                  </span>
                ) : (
                  <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                    {signalEvents.length} drop events
                  </span>
                )}
                <span className="text-xs text-[var(--text-faint)]">
                  {signalSummary.lostCount} lost · {signalSummary.weakCount} weak ·{" "}
                  {Math.round(signalSummary.badMs / 1000)}s of dropouts
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSignalExpanded((v) => !v)}
                className="text-xs text-[var(--text-muted)] underline-offset-4 hover:text-[var(--lime)] hover:underline"
              >
                {signalExpanded ? "Hide" : `Show ${signalEvents.length} events`}
              </button>
            </div>
            {signalExpanded && (
              <ul className="mt-3 divide-y divide-[var(--border)] border-t border-[var(--border)] text-sm">
                {signalEvents.map((e, i) => (
                  <li
                    key={`${e.kind}-${e.t_start_ms}-${i}`}
                    className="grid grid-cols-12 items-center gap-3 py-2"
                  >
                    <span className="col-span-3 tabular-nums text-[var(--text-muted)]">
                      {fmtRange(e.t_start_ms, e.t_end_ms)}
                    </span>
                    <span className="col-span-3">
                      <span
                        className={
                          e.kind === "lost"
                            ? "rounded-full bg-[var(--red)]/15 px-2 py-0.5 text-xs text-[var(--red)]"
                            : "rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700"
                        }
                      >
                        {e.kind === "lost" ? "Lost contact" : "Noisy"}
                      </span>
                    </span>
                    <span className="col-span-6 tabular-nums text-right text-xs text-[var(--text-faint)]">
                      {Math.max(1, Math.round((e.t_end_ms - e.t_start_ms) / 1000))} s
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium text-[var(--text-muted)]">Metrics</h2>
        {metrics ? (
          <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm md:grid-cols-3">
            {METRIC_ROWS.map((row) => (
              <div key={row.key} className="flex items-baseline justify-between gap-3">
                <dt className="text-[var(--text-faint)]">{row.label}</dt>
                <dd className="tabular-nums">
                  {fmtMetric(metrics[row.key], row.digits)}
                  {row.unit ? <span className="ml-1 text-xs text-[var(--text-faint)]">{row.unit}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--text-faint)]">
            Metrics have not been computed for this session.
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-[var(--text-muted)]">Label blocks</h2>
        {labels.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--text-faint)]">
            No label blocks for this session.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-sm">
            {labels.map((l, i) => (
              <li key={`${l.start_ms}-${i}`} className="grid grid-cols-12 items-center gap-3 p-3">
                <span className="col-span-3 tabular-nums text-[var(--text-muted)]">
                  {fmtRange(l.start_ms, l.end_ms)}
                </span>
                <span className="col-span-3">{l.label}</span>
                <span className="col-span-2 tabular-nums">{l.jump_count} jumps</span>
                <span className="col-span-4 text-right text-xs uppercase tracking-wide text-[var(--text-faint)]">
                  {l.correction_kind}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <InsightPanel sessionId={sessionId} initial={initialInsight} />

      <DataSourcesPanel counts={sourceCounts} />

      <ExportsPanel sessionId={sessionId} counts={sourceCounts} />
    </div>
  );
}
