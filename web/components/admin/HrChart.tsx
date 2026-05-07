type Sample = {
  timestamp_ms: number;
  hr_bpm: number | null;
  contact: boolean | null;
};

type Props = {
  samples: Sample[];
  totalSamples: number;
};

const W = 720;
const H = 240;
const PAD_L = 40;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 28;
const CHART_W = W - PAD_L - PAD_R;
const CHART_H = H - PAD_T - PAD_B;

function fmtTime(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function HrChart({ samples, totalSamples }: Props) {
  if (samples.length === 0) {
    return (
      <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
        No HR samples recorded for this session.
      </div>
    );
  }

  const t0 = samples[0].timestamp_ms;
  const tEnd = samples[samples.length - 1].timestamp_ms;
  const span = Math.max(1, tEnd - t0);

  const valid = samples.filter(
    (s): s is Sample & { hr_bpm: number } => typeof s.hr_bpm === "number" && s.hr_bpm > 0,
  );

  if (valid.length === 0) {
    return (
      <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
        Samples present but no usable HR readings (sensor likely off-skin).
      </div>
    );
  }

  let yMin = Math.min(...valid.map((s) => s.hr_bpm));
  let yMax = Math.max(...valid.map((s) => s.hr_bpm));
  yMin = Math.max(20, Math.floor((yMin - 10) / 10) * 10);
  yMax = Math.min(240, Math.ceil((yMax + 10) / 10) * 10);
  if (yMax - yMin < 20) yMax = yMin + 20;
  const yRange = yMax - yMin;

  const xOf = (ms: number) => PAD_L + ((ms - t0) / span) * CHART_W;
  const yOf = (hr: number) => PAD_T + CHART_H - ((hr - yMin) / yRange) * CHART_H;

  const path = valid
    .map((s, i) => `${i === 0 ? "M" : "L"} ${xOf(s.timestamp_ms).toFixed(1)} ${yOf(s.hr_bpm).toFixed(1)}`)
    .join(" ");

  const yTicks: number[] = [];
  const tickStep = yRange <= 40 ? 10 : yRange <= 100 ? 20 : 40;
  for (let v = yMin; v <= yMax; v += tickStep) yTicks.push(v);

  const xTickCount = 5;
  const xTicks = Array.from({ length: xTickCount + 1 }, (_, i) => t0 + (span * i) / xTickCount);

  const validCount = valid.length;
  const dropped = samples.length - validCount;
  const truncated = totalSamples > samples.length;

  return (
    <div>
      <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label="Heart rate over time"
        >
          {yTicks.map((v) => (
            <g key={`y-${v}`}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={yOf(v)}
                y2={yOf(v)}
                stroke="var(--border)"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              <text
                x={PAD_L - 6}
                y={yOf(v)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={10}
                fill="var(--text-faint)"
              >
                {v}
              </text>
            </g>
          ))}

          {xTicks.map((ms, i) => (
            <text
              key={`x-${i}`}
              x={xOf(ms)}
              y={H - 8}
              textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
              fontSize={10}
              fill="var(--text-faint)"
            >
              {fmtTime(ms - t0)}
            </text>
          ))}

          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={PAD_T + CHART_H}
            y2={PAD_T + CHART_H}
            stroke="var(--border)"
            strokeWidth={1}
          />
          <line
            x1={PAD_L}
            x2={PAD_L}
            y1={PAD_T}
            y2={PAD_T + CHART_H}
            stroke="var(--border)"
            strokeWidth={1}
          />

          <path d={path} fill="none" stroke="var(--lime)" strokeWidth={1.5} />

          <text
            x={PAD_L - 32}
            y={PAD_T + CHART_H / 2}
            textAnchor="middle"
            transform={`rotate(-90 ${PAD_L - 32} ${PAD_T + CHART_H / 2})`}
            fontSize={10}
            fill="var(--text-muted)"
          >
            HR (bpm)
          </text>
        </svg>
      </div>
      <p className="mt-2 text-xs text-[var(--text-faint)]">
        {validCount} HR readings
        {dropped > 0 ? ` (${dropped} non-readings hidden)` : ""}
        {truncated ? ` — chart capped at ${samples.length} of ${totalSamples} total` : ""}
      </p>
    </div>
  );
}
