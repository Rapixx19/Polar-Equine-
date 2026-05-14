"use client";

import {
  Area,
  AreaChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { GaitLabel } from "@/lib/session/segments";

type Segment = { start_ms: number; end_ms: number; label: GaitLabel };
type Sample = { ts_ms: number; bpm: number };
type SignalEvent = { kind: "weak" | "lost"; t_start_ms: number; t_end_ms: number };

// Quality-event bands sit on top of the gait fill so a span flagged as
// "lost" reads visually as a no-go zone for downstream analysis. Stripes
// would be more correct semantically but Recharts ReferenceArea doesn't
// support pattern fills out of the box; a saturated translucent block is
// the next best signal.
const SIGNAL_FILL: Record<SignalEvent["kind"], string> = {
  weak: "rgba(245,158,11,0.28)",
  lost: "rgba(239,68,68,0.32)",
};

// Per-gait shading. Bumped up from v0.1 (≈0.18) so segment boundaries are
// visually unambiguous on the spike — the rider needs to see *which*
// part of the HR trace got classified as what.
const LABEL_FILL: Record<GaitLabel, string> = {
  halt: "rgba(120,120,120,0.30)",
  walk: "rgba(59,130,246,0.32)",
  trot: "rgba(245,158,11,0.32)",
  canter: "rgba(190,242,100,0.36)",
  jump: "rgba(236,72,153,0.36)",
  not_sure: "rgba(120,120,120,0.22)",
};

const LABEL_SHORT: Record<GaitLabel, string> = {
  halt: "Halt",
  walk: "Walk",
  trot: "Trot",
  canter: "Canter",
  jump: "Jump",
  not_sure: "?",
};

function tickFmt(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? `0${s}` : s}`;
}

export function HRChart({
  samples,
  segments,
  signalEvents = [],
  durationMs,
  height = 200,
}: {
  samples: Sample[];
  segments: Segment[];
  signalEvents?: SignalEvent[];
  durationMs?: number;
  height?: number;
}) {
  if (samples.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-xs text-[var(--text-faint)]"
        style={{ height }}
      >
        No heart-rate data for this session.
      </div>
    );
  }

  const data = samples.map((s) => ({ t: s.ts_ms, bpm: s.bpm }));
  const minBpm = Math.min(...samples.map((s) => s.bpm));
  const maxBpm = Math.max(...samples.map((s) => s.bpm));
  const xMax = Math.max(
    durationMs ?? 0,
    segments.length > 0 ? segments[segments.length - 1].end_ms : 0,
    samples[samples.length - 1]?.ts_ms ?? 0,
  );
  const yMax = maxBpm + 12;
  // Don't draw a divider at t=0 or t=xMax — only interior boundaries.
  const dividers = segments.slice(1).map((s) => s.start_ms);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="hrFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--lime)" stopOpacity={0.5} />
              <stop offset="100%" stopColor="var(--lime)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          {segments.map((seg) => (
            <ReferenceArea
              key={`fill-${seg.start_ms}-${seg.end_ms}`}
              x1={seg.start_ms}
              x2={seg.end_ms}
              fill={LABEL_FILL[seg.label]}
              strokeOpacity={0}
              ifOverflow="extendDomain"
              label={{
                value: LABEL_SHORT[seg.label],
                position: "insideTop",
                fill: "var(--text)",
                fontSize: 10,
                offset: 4,
              }}
            />
          ))}
          {dividers.map((ms) => (
            <ReferenceLine
              key={`div-${ms}`}
              x={ms}
              stroke="var(--border)"
              strokeDasharray="2 3"
              strokeOpacity={0.7}
            />
          ))}
          {signalEvents.map((e) => (
            <ReferenceArea
              key={`sig-${e.kind}-${e.t_start_ms}-${e.t_end_ms}`}
              x1={e.t_start_ms}
              x2={e.t_end_ms}
              fill={SIGNAL_FILL[e.kind]}
              strokeOpacity={0}
              ifOverflow="extendDomain"
              label={{
                value: e.kind === "lost" ? "lost" : "noisy",
                position: "insideBottom",
                fill: e.kind === "lost" ? "var(--red)" : "rgb(180,83,9)",
                fontSize: 9,
                offset: 4,
              }}
            />
          ))}
          <XAxis
            dataKey="t"
            type="number"
            domain={[0, xMax]}
            tickFormatter={tickFmt}
            stroke="var(--text-faint)"
            fontSize={10}
            tickLine={false}
            allowDataOverflow={false}
          />
          <YAxis
            domain={[Math.max(0, minBpm - 10), yMax]}
            stroke="var(--text-faint)"
            fontSize={10}
            tickLine={false}
            width={32}
            unit=""
          />
          <Tooltip
            contentStyle={{
              background: "var(--canvas)",
              border: "1px solid var(--border)",
              fontSize: 12,
            }}
            labelFormatter={(ms) => `t = ${tickFmt(Number(ms))}`}
            formatter={(value) => [`${Math.round(Number(value))} bpm`, "HR"]}
          />
          <Area
            type="monotone"
            dataKey="bpm"
            stroke="var(--lime)"
            strokeWidth={1.5}
            fill="url(#hrFill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
