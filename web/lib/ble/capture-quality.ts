import type { HRSample } from "@/lib/ble/hr-codec";

export type QualityState = "good" | "weak" | "lost";

export type QualitySummary = {
  goodPct: number;
  weakPct: number;
  lostPct: number;
  windowCount: number;
};

export type DeriveStateInput = {
  contact: HRSample["contact"];
  correctionRate: number;     // [0, 1] — Lipponen-Tarvainen first-pass rate over rolling window
  msSinceLastSample: number;  // ms since last received sample
};

const SILENCE_THRESHOLD_MS = 5_000;
const WEAK_CORRECTION_RATE = 0.05;

// Derives the current 3-state quality from a single windowed snapshot.
// Pure function: same inputs always produce the same output. Tested in
// tests/capture-quality.test.ts.
//
// Decision: H10 contact enum is "unsupported" | "no_contact" | "contact"
// (per hr-codec.ts; plan wrote "no-contact" but codec uses underscore).
// "contact" -> good (default); "no_contact" -> weak (poor strap);
// "unsupported" -> treated as good (old strap not reporting contact).
// Lost is hardware-silence-only — high correction rate alone is still 'weak'
// per the spec (high correction = strap quality, not lost connection).
export function deriveState({
  contact,
  correctionRate,
  msSinceLastSample,
}: DeriveStateInput): QualityState {
  if (msSinceLastSample > SILENCE_THRESHOLD_MS) return "lost";
  if (contact === "no_contact") return "weak";
  if (correctionRate >= WEAK_CORRECTION_RATE) return "weak";
  return "good";
}

export function emptySummary(): QualitySummary {
  return { goodPct: 0, weakPct: 0, lostPct: 0, windowCount: 0 };
}

// O(1) incremental update: bumps the matching counter and recomputes the
// three percentages from the running totals. Never re-walks a buffer —
// per spec correctness guarantee #1.
export function aggregateSummary(prev: QualitySummary, state: QualityState): QualitySummary {
  const goodN = Math.round(prev.goodPct * prev.windowCount) + (state === "good" ? 1 : 0);
  const weakN = Math.round(prev.weakPct * prev.windowCount) + (state === "weak" ? 1 : 0);
  const lostN = Math.round(prev.lostPct * prev.windowCount) + (state === "lost" ? 1 : 0);
  const total = prev.windowCount + 1;
  return {
    goodPct: goodN / total,
    weakPct: weakN / total,
    lostPct: lostN / total,
    windowCount: total,
  };
}

// Returns the frozen summary if one already exists, otherwise freezes the
// current summary by returning its reference. The hook stores the returned
// reference in a ref and passes it back as `alreadyFrozen` on every call,
// guaranteeing reference stability for the saved-page consumer (spec
// correctness guarantee #3).
export function freezeSummary(
  current: QualitySummary,
  alreadyFrozen: QualitySummary | null,
): QualitySummary {
  return alreadyFrozen ?? current;
}

const RR_JUMP_THRESHOLD = 0.20;

// Correction-rate proxy: count consecutive RR intervals where
// |RR_i - RR_{i-1}| / RR_{i-1} > 0.20.
// Source: Lipponen & Tarvainen 2019, "A robust algorithm for heart rate
// variability time series artefact correction using novel beat
// classification" (J. Med. Eng. Technol. 2019). The 20% relative-change
// test is their first-pass artefact gate. Full algorithm has more stages
// (Q1/Q3 thresholds, ectopic detection, missing-beat interpolation) —
// that work runs algo-side. This is the cheap O(n) version suitable for
// live client-side rendering.
export function computeCorrectionRate(rr: readonly number[]): number {
  if (rr.length < 2) return 0;
  let jumps = 0;
  for (let i = 1; i < rr.length; i++) {
    const prev = rr[i - 1];
    const curr = rr[i];
    if (prev > 0 && Math.abs(curr - prev) / prev > RR_JUMP_THRESHOLD) jumps++;
  }
  return jumps / (rr.length - 1);
}
