"use client";

import type { QualityState } from "@/lib/ble/capture-quality";

type Props = {
  state: QualityState;
  goodPct?: number;
};

export function CaptureQualityBadge({ state, goodPct }: Props) {
  const dot = state === "good" ? "🟢" : state === "weak" ? "🟡" : "🔴";
  const label =
    state === "good"
      ? "Strap contact good"
      : state === "weak"
        ? "Adjust strap"
        : "Lost contact";

  return (
    <div
      role="status"
      aria-live="polite"
      data-state={state}
      data-good-pct={goodPct?.toFixed(3)}
      className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs"
    >
      <span aria-hidden>{dot}</span>
      <span className="text-stone-700">{label}</span>
    </div>
  );
}
