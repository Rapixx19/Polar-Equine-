// Inline 14-day sparkline. No charting dep — a sparkline is just three
// SVG primitives and the alternative (Recharts on every roster row) would
// re-mount a chart per rider, which is wasteful for a 60×16 px graphic.
//
// `values` is the daily-sessions array from the rollup: 14 numbers,
// oldest first, today last.

export function Sparkline({
  values,
  width = 64,
  height = 16,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length === 0) {
    return <span className="text-xs text-[var(--text-faint)]">—</span>;
  }
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : 0;

  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = height - (v / max) * (height - 2) - 1;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  // Bars for the few non-zero days (more legible than a flat line of zeros).
  const bars = values.map((v, i) => {
    if (v === 0) return null;
    const x = i * step - 1;
    const h = Math.max(2, (v / max) * (height - 2));
    const y = height - h - 1;
    return <rect key={i} x={x} y={y} width={2} height={h} fill="currentColor" rx={0.5} />;
  });

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="text-[var(--lime)]"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.35}
        strokeWidth={1}
      />
      {bars}
    </svg>
  );
}
