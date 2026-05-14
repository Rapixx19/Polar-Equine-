"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = { ts_ms: number; bpm: number };

function tickFmt(secondsAgo: number): string {
  if (secondsAgo <= 0) return "now";
  const m = Math.floor(secondsAgo / 60);
  const s = Math.round(secondsAgo % 60);
  return m > 0 ? `-${m}m${s.toString().padStart(2, "0")}` : `-${s}s`;
}

export function HRLiveStrip({
  points,
  latestTs,
  height = 200,
}: {
  points: Point[];
  latestTs: number;
  height?: number;
}) {
  const data = useMemo(
    () => points.map((p) => ({ secondsAgo: (latestTs - p.ts_ms) / 1000, bpm: p.bpm })),
    [points, latestTs],
  );

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2">
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="hrLiveFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--lime)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="var(--lime)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="secondsAgo"
              type="number"
              reversed
              domain={[0, 600]}
              ticks={[0, 60, 180, 300, 480, 600]}
              tickFormatter={tickFmt}
              tick={{ fontSize: 11, fill: "var(--text-faint)" }}
              stroke="var(--border)"
            />
            <YAxis
              dataKey="bpm"
              domain={[40, 200]}
              ticks={[60, 100, 140, 180]}
              tick={{ fontSize: 11, fill: "var(--text-faint)" }}
              stroke="var(--border)"
              width={32}
            />
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                fontSize: 12,
              }}
              labelFormatter={(v) => tickFmt(Number(v))}
              formatter={(v) => [`${Math.round(Number(v))} bpm`, "HR"]}
            />
            <Area
              type="monotone"
              dataKey="bpm"
              stroke="var(--lime)"
              strokeWidth={2}
              fill="url(#hrLiveFill)"
              isAnimationActive={false}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
