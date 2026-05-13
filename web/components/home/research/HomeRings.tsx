import type { ProgressContext } from "@/lib/research/fetch-progress";

// Three small stand-alone ring cards in a row, each measuring a different
// research dimension: sessions toward quota, horses sampled, gait coverage.
// Server component — derived from ProgressContext, no extra queries.

type RingCard = {
  label: string;
  fraction: number;
  primary: string;
  caption: string;
  color: string;
};

const RADIUS = 26;
const STROKE_W = 6;
const BG = "rgba(0,0,0,0.08)";
const CIRC = 2 * Math.PI * RADIUS;

export function HomeRings({ ctx }: { ctx: ProgressContext }) {
  const { report, avgDataQuality, dataQualitySampleSize } = ctx;
  const sessionsFrac = clamp01(report.sessionsApproved / Math.max(1, report.sessionsTarget));
  const coverageFrac = clamp01(report.gaitCoverage);
  const qualityFrac = avgDataQuality == null ? 0 : clamp01(avgDataQuality);

  const cards: RingCard[] = [
    {
      label: "Sessions",
      fraction: sessionsFrac,
      primary: `${report.sessionsApproved}`,
      caption: `of ${report.sessionsTarget}`,
      color: "var(--lime)",
    },
    {
      label: "Accuracy",
      fraction: qualityFrac,
      primary: avgDataQuality == null ? "—" : `${Math.round(qualityFrac * 100)}%`,
      caption:
        avgDataQuality == null
          ? "no data yet"
          : `${dataQualitySampleSize} session${dataQualitySampleSize === 1 ? "" : "s"}`,
      color: "#0284c7",
    },
    {
      label: "Gait mix",
      fraction: coverageFrac,
      primary: `${Math.round(coverageFrac * 100)}%`,
      caption: "covered",
      color: "#d97706",
    },
  ];

  return (
    <div className="mb-6 grid grid-cols-3 gap-2">
      {cards.map((c) => (
        <RingCardView key={c.label} card={c} />
      ))}
    </div>
  );
}

function RingCardView({ card }: { card: RingCard }) {
  const offset = CIRC * (1 - card.fraction);
  return (
    <div className="flex flex-col items-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <svg viewBox="0 0 60 60" className="h-16 w-16" aria-hidden>
        <g transform="rotate(-90 30 30)">
          <circle cx={30} cy={30} r={RADIUS} fill="none" stroke={BG} strokeWidth={STROKE_W} />
          <circle
            cx={30}
            cy={30}
            r={RADIUS}
            fill="none"
            stroke={card.color}
            strokeWidth={STROKE_W}
            strokeDasharray={CIRC}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 600ms ease-out" }}
          />
        </g>
        <text
          x={30}
          y={32}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-[var(--text)]"
          style={{ font: "500 14px system-ui, sans-serif" }}
        >
          {card.primary}
        </text>
      </svg>
      <p className="mt-1 text-[11px] font-medium text-[var(--text)]">{card.label}</p>
      <p className="text-[10px] text-[var(--text-faint)]">{card.caption}</p>
    </div>
  );
}

function clamp01(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n >= 1 ? 1 : n;
}
