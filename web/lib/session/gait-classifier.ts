// v0.1 HR-threshold gait classifier — Slice 15.A bootstrap.
//
// Inputs: an ordered series of HR samples (ts_ms relative to session start, bpm).
// Output: contiguous labeled segments covering the session.
//
// This is intentionally crude. H10-only campaign (memory) means no ACC features
// yet — without rhythm/impulse data we can only guess gait from HR magnitude.
// The classifier exists to give the rider something to *correct*, which is the
// real ground truth. Corrections are what trains the better Slice 13 classifier.
//
// Bump algo_version when thresholds change so `label_corrections.algo_version`
// records which auto-labels the rider was reacting to.

import type { GaitLabel } from "@/lib/session/segments";

export const GAIT_CLASSIFIER_ALGO_VERSION = "hr-hybrid-v0.3";

// Smoothing window: 10 s rolling mean. Tighter than v0.1's 15 s — keeps real
// transitions sharp while still rejecting single-beat noise.
const SMOOTHING_WINDOW_MS = 10_000;

// Minimum segment length. 10 s lets short canter bursts (~half a long-side
// of the arena) survive instead of being merged into adjacent walks.
const MIN_SEGMENT_MS = 10_000;

// Adaptive bands. Instead of absolute bpm thresholds (fitness-blind), we
// compute baseline = 10th percentile of session HR and peak = 90th. Bands
// scale as fractions of (peak - baseline). This way a fit rider's 110 bpm
// trot and an unfit rider's 150 bpm trot both get the right label.
const BAND_FRACTIONS = [
  { fracMax: 0.3, label: "walk" as GaitLabel },
  { fracMax: 0.65, label: "trot" as GaitLabel },
  { fracMax: Infinity, label: "canter" as GaitLabel },
];

// If session HR is essentially flat (peak ≈ baseline), adaptive bands are
// meaningless. Fall back to absolute thresholds — same as v0.1.
const FLAT_RANGE_BPM = 20;
const ABSOLUTE_THRESHOLDS: Array<{ max: number; label: GaitLabel }> = [
  { max: 75, label: "halt" },
  { max: 105, label: "walk" },
  { max: 140, label: "trot" },
  { max: 999, label: "canter" },
];

// Hard guardrails (v0.3). Extreme HR is unambiguous regardless of session
// shape. Without these, a sustained-canter ride would mislabel its slowest
// minute as "walk" (because adaptive bands say bottom 30% = walk), and a
// lazy hack with HR 70–90 would spuriously split into trot/canter at the
// peaks. Empirically chosen — to be re-tuned from real corrections.
const HARD_HALT_MAX = 70;
const HARD_WALK_MAX = 95;
const HARD_CANTER_MIN = 160;

export type HRSample = { ts_ms: number; bpm: number };

export type AutoSegment = {
  start_ms: number;
  end_ms: number;
  label: GaitLabel;
  avg_bpm: number;
  peak_bpm: number;
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)));
  return sorted[idx];
}

type Bands = { baseline: number; peak: number };

function computeBands(samples: HRSample[]): Bands {
  const sorted = samples.map((s) => s.bpm).sort((a, b) => a - b);
  return {
    baseline: percentile(sorted, 0.1),
    peak: percentile(sorted, 0.9),
  };
}

function classify(bpm: number, bands: Bands): GaitLabel {
  // Hard guardrails first — extreme HR is unambiguous regardless of bands.
  if (bpm <= HARD_HALT_MAX) return "halt";
  if (bpm <= HARD_WALK_MAX) return "walk";
  if (bpm >= HARD_CANTER_MIN) return "canter";

  // Middle band: use adaptive percentiles when the session has enough
  // dynamic range to be informative, else fall back to absolute thresholds.
  const range = bands.peak - bands.baseline;
  if (range < FLAT_RANGE_BPM) {
    for (const t of ABSOLUTE_THRESHOLDS) if (bpm <= t.max) return t.label;
    return "canter";
  }
  const frac = (bpm - bands.baseline) / range;
  if (frac < 0) return "halt";
  for (const b of BAND_FRACTIONS) if (frac <= b.fracMax) return b.label;
  return "canter";
}

function rollingMean(samples: HRSample[], windowMs: number): HRSample[] {
  const out: HRSample[] = [];
  let left = 0;
  let sum = 0;
  for (let right = 0; right < samples.length; right++) {
    sum += samples[right].bpm;
    while (samples[right].ts_ms - samples[left].ts_ms > windowMs) {
      sum -= samples[left].bpm;
      left++;
    }
    out.push({ ts_ms: samples[right].ts_ms, bpm: sum / (right - left + 1) });
  }
  return out;
}

// Walk the smoothed series, emit a new segment whenever the label flips.
function rawSegments(
  smoothed: HRSample[],
  durationMs: number,
  bands: Bands,
): AutoSegment[] {
  if (smoothed.length === 0) {
    return [
      { start_ms: 0, end_ms: durationMs, label: "not_sure", avg_bpm: 0, peak_bpm: 0 },
    ];
  }
  const segs: AutoSegment[] = [];
  let curStart = 0;
  let curLabel = classify(smoothed[0].bpm, bands);
  let sum = 0;
  let count = 0;
  let peak = 0;

  for (const s of smoothed) {
    const label = classify(s.bpm, bands);
    if (label !== curLabel) {
      segs.push({
        start_ms: curStart,
        end_ms: s.ts_ms,
        label: curLabel,
        avg_bpm: count > 0 ? Math.round(sum / count) : 0,
        peak_bpm: Math.round(peak),
      });
      curStart = s.ts_ms;
      curLabel = label;
      sum = 0;
      count = 0;
      peak = 0;
    }
    sum += s.bpm;
    count += 1;
    if (s.bpm > peak) peak = s.bpm;
  }
  segs.push({
    start_ms: curStart,
    end_ms: durationMs,
    label: curLabel,
    avg_bpm: count > 0 ? Math.round(sum / count) : 0,
    peak_bpm: Math.round(peak),
  });
  return segs;
}

// Merge any segment shorter than MIN_SEGMENT_MS into its longer neighbor.
// Recompute stats by re-running over original samples is overkill — keep the
// dominant neighbor's stats. Good enough for a v0.1 the rider will correct.
function mergeShortSegments(segs: AutoSegment[]): AutoSegment[] {
  if (segs.length <= 1) return segs;
  const out: AutoSegment[] = [];
  for (const s of segs) {
    const len = s.end_ms - s.start_ms;
    if (len < MIN_SEGMENT_MS && out.length > 0) {
      const prev = out[out.length - 1];
      out[out.length - 1] = {
        start_ms: prev.start_ms,
        end_ms: s.end_ms,
        label: prev.label,
        avg_bpm: Math.round((prev.avg_bpm + s.avg_bpm) / 2),
        peak_bpm: Math.max(prev.peak_bpm, s.peak_bpm),
      };
    } else {
      out.push(s);
    }
  }
  // Second pass: trailing tiny segment
  if (out.length > 1) {
    const last = out[out.length - 1];
    if (last.end_ms - last.start_ms < MIN_SEGMENT_MS) {
      const prev = out[out.length - 2];
      out.splice(out.length - 2, 2, {
        start_ms: prev.start_ms,
        end_ms: last.end_ms,
        label: prev.label,
        avg_bpm: Math.round((prev.avg_bpm + last.avg_bpm) / 2),
        peak_bpm: Math.max(prev.peak_bpm, last.peak_bpm),
      });
    }
  }
  return out;
}

export function classifySession(samples: HRSample[], durationMs: number): AutoSegment[] {
  if (durationMs <= 0) return [];
  const smoothed = rollingMean(samples, SMOOTHING_WINDOW_MS);
  const bands = computeBands(smoothed);
  return mergeShortSegments(rawSegments(smoothed, durationMs, bands));
}
