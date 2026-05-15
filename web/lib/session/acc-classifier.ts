// v0.1 ACC stride-frequency gait classifier — sliding window + autocorrelation.
// Thresholds are TENTATIVE; bump ACC_CLASSIFIER_ALGO_VERSION after the first
// horse ride (2026-05-15) once real stride distributions are in hand.

import type { GaitLabel } from "@/lib/session/segments";
import {
  type AccSample,
  detrend,
  estimateSampleHz,
  magnitudeSeries,
  mean,
  rms,
} from "@/lib/session/acc-magnitude";

export const ACC_CLASSIFIER_ALGO_VERSION = "acc-autocorr-v0.1";

const WINDOW_MS = 4000;
const HOP_MS = 1000;
const MIN_SEGMENT_MS = 4000;

const MIN_FREQ_HZ = 0.9;
const MAX_FREQ_HZ = 5.5;
const MIN_CONFIDENCE = 0.25;
const HALT_RMS_G = 0.05;

const BAND_THRESHOLDS: Array<{ maxHz: number; label: GaitLabel }> = [
  { maxHz: 2.0, label: "walk" },
  { maxHz: 3.5, label: "trot" },
  { maxHz: 5.5, label: "canter" },
];

export type AccSegment = {
  start_ms: number;
  end_ms: number;
  label: GaitLabel;
  stride_hz: number;
  confidence: number;
};

function labelForFreq(hz: number): GaitLabel {
  for (const b of BAND_THRESHOLDS) if (hz <= b.maxHz) return b.label;
  return "not_sure";
}

function autocorrPeak(
  series: number[],
  sampleHz: number,
): { stride_hz: number; confidence: number } {
  const lagMin = Math.max(1, Math.floor(sampleHz / MAX_FREQ_HZ));
  const lagMax = Math.ceil(sampleHz / MIN_FREQ_HZ);
  if (series.length < lagMax * 2) return { stride_hz: 0, confidence: 0 };

  let r0 = 0;
  for (let i = 0; i < series.length; i++) r0 += series[i] * series[i];
  if (r0 === 0) return { stride_hz: 0, confidence: 0 };

  let bestLag = 0;
  let bestVal = -Infinity;
  for (let tau = lagMin; tau <= lagMax; tau++) {
    let r = 0;
    const upper = series.length - tau;
    for (let i = 0; i < upper; i++) r += series[i] * series[i + tau];
    if (r > bestVal) {
      bestVal = r;
      bestLag = tau;
    }
  }
  return {
    stride_hz: bestLag > 0 ? sampleHz / bestLag : 0,
    confidence: Math.max(0, bestVal / r0),
  };
}

type WindowVerdict = {
  ts_ms: number;
  label: GaitLabel;
  stride_hz: number;
  confidence: number;
};

function classifyWindow(slice: AccSample[], sampleHz: number, ts_ms: number): WindowVerdict {
  if (slice.length < sampleHz) {
    return { ts_ms, label: "not_sure", stride_hz: 0, confidence: 0 };
  }
  const detrended = detrend(magnitudeSeries(slice));
  if (rms(detrended) < HALT_RMS_G) {
    return { ts_ms, label: "halt", stride_hz: 0, confidence: 1 };
  }
  const { stride_hz, confidence } = autocorrPeak(detrended, sampleHz);
  if (confidence < MIN_CONFIDENCE || stride_hz === 0) {
    return { ts_ms, label: "not_sure", stride_hz, confidence };
  }
  return { ts_ms, label: labelForFreq(stride_hz), stride_hz, confidence };
}

function collapse(windows: WindowVerdict[], durationMs: number): AccSegment[] {
  if (windows.length === 0) return [];
  const segs: AccSegment[] = [];
  let curStart = windows[0].ts_ms;
  let curLabel = windows[0].label;
  let hzs: number[] = [];
  let confs: number[] = [];
  const flush = (endMs: number) => {
    segs.push({
      start_ms: curStart,
      end_ms: endMs,
      label: curLabel,
      stride_hz: Number(mean(hzs).toFixed(2)),
      confidence: Number(mean(confs).toFixed(3)),
    });
  };
  for (const w of windows) {
    if (w.label !== curLabel) {
      flush(w.ts_ms);
      curStart = w.ts_ms;
      curLabel = w.label;
      hzs = [];
      confs = [];
    }
    hzs.push(w.stride_hz);
    confs.push(w.confidence);
  }
  flush(durationMs);
  return segs;
}

function mergeShort(segs: AccSegment[]): AccSegment[] {
  if (segs.length <= 1) return segs;
  const out: AccSegment[] = [];
  for (const s of segs) {
    if (s.end_ms - s.start_ms < MIN_SEGMENT_MS && out.length > 0) {
      const prev = out[out.length - 1];
      out[out.length - 1] = { ...prev, end_ms: s.end_ms };
    } else {
      out.push(s);
    }
  }
  if (out.length > 1) {
    const last = out[out.length - 1];
    if (last.end_ms - last.start_ms < MIN_SEGMENT_MS) {
      const prev = out[out.length - 2];
      out.splice(out.length - 2, 2, { ...prev, end_ms: last.end_ms });
    }
  }
  return out;
}

export function classifySessionAcc(samples: AccSample[], durationMs: number): AccSegment[] {
  if (durationMs <= 0 || samples.length === 0) return [];
  const sampleHz = estimateSampleHz(samples);

  const windows: WindowVerdict[] = [];
  let startIdx = 0;
  let endIdx = 0;
  for (let t = 0; t + HOP_MS <= durationMs; t += HOP_MS) {
    const winEnd = Math.min(durationMs, t + WINDOW_MS);
    while (startIdx < samples.length && samples[startIdx].ts_ms < t) startIdx++;
    while (endIdx < samples.length && samples[endIdx].ts_ms < winEnd) endIdx++;
    windows.push(classifyWindow(samples.slice(startIdx, endIdx), sampleHz, t));
  }
  return mergeShort(collapse(windows, durationMs));
}
