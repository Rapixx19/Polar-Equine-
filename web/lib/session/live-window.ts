// Pure helpers for the /admin/live endpoint. Kept dependency-free so the
// API route can stay thin and these can be tested in isolation.

import {
  ACC_CLASSIFIER_ALGO_VERSION,
  classifySessionAcc,
} from "@/lib/session/acc-classifier";
import type { AccSample } from "@/lib/session/acc-magnitude";

export type LiveGait = {
  label: string;
  stride_hz: number;
  confidence: number;
  algo_version: string;
};

export function rebaseToZero<T extends { ts_ms: number }>(samples: T[]): T[] {
  if (samples.length === 0) return samples;
  const t0 = samples[0].ts_ms;
  return samples.map((s) => ({ ...s, ts_ms: s.ts_ms - t0 }));
}

export function magnitudeWindow(
  accSamples: AccSample[],
  targetHz = 50,
): Array<{ ts_ms: number; m: number }> {
  if (accSamples.length === 0) return [];
  const stride = Math.max(1, Math.floor(accSamples.length / Math.max(1, targetHz * 4)));
  const out: Array<{ ts_ms: number; m: number }> = [];
  for (let i = 0; i < accSamples.length; i += stride) {
    const s = accSamples[i];
    out.push({ ts_ms: s.ts_ms, m: Math.hypot(s.ax, s.ay, s.az) });
  }
  return out;
}

export function inferCurrentGait(accSamples: AccSample[]): LiveGait | null {
  if (accSamples.length < 200) return null;
  const rebased = rebaseToZero(accSamples);
  const durationMs = rebased[rebased.length - 1].ts_ms + 1;
  const segs = classifySessionAcc(rebased, durationMs);
  if (segs.length === 0) return null;
  const last = segs[segs.length - 1];
  return {
    label: last.label,
    stride_hz: last.stride_hz,
    confidence: last.confidence,
    algo_version: ACC_CLASSIFIER_ALGO_VERSION,
  };
}

export function secondsSince(iso: string | null | undefined, nowMs: number): number {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return Math.max(0, (nowMs - t) / 1000);
}
