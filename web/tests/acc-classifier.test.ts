import { describe, expect, it } from "vitest";

import {
  ACC_CLASSIFIER_ALGO_VERSION,
  classifySessionAcc,
} from "@/lib/session/acc-classifier";
import type { AccSample } from "@/lib/session/acc-magnitude";

const SAMPLE_HZ = 200;
const PERIOD_MS = 1000 / SAMPLE_HZ;

function sine(freqHz: number, durationMs: number, amplitude = 0.35): AccSample[] {
  const out: AccSample[] = [];
  const n = Math.round(durationMs / PERIOD_MS);
  for (let i = 0; i < n; i++) {
    const t = i * PERIOD_MS;
    const phase = 2 * Math.PI * freqHz * (t / 1000);
    out.push({ ts_ms: t, ax: 0, ay: 0, az: 1 + amplitude * Math.sin(phase) });
  }
  return out;
}

function flat(durationMs: number, mag = 1): AccSample[] {
  const out: AccSample[] = [];
  const n = Math.round(durationMs / PERIOD_MS);
  for (let i = 0; i < n; i++) out.push({ ts_ms: i * PERIOD_MS, ax: 0, ay: 0, az: mag });
  return out;
}

function whiteNoise(durationMs: number, amplitude = 0.4): AccSample[] {
  const out: AccSample[] = [];
  const n = Math.round(durationMs / PERIOD_MS);
  let seed = 13;
  const rng = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 0; i < n; i++) {
    out.push({
      ts_ms: i * PERIOD_MS,
      ax: 0,
      ay: 0,
      az: 1 + (rng() - 0.5) * amplitude,
    });
  }
  return out;
}

function concat(...chunks: AccSample[][]): AccSample[] {
  const out: AccSample[] = [];
  let offset = 0;
  for (const chunk of chunks) {
    if (chunk.length === 0) continue;
    const lastTs = chunk[chunk.length - 1].ts_ms;
    for (const s of chunk) out.push({ ...s, ts_ms: s.ts_ms + offset });
    offset += lastTs + PERIOD_MS;
  }
  return out;
}

describe("classifySessionAcc", () => {
  it("returns empty for no samples", () => {
    expect(classifySessionAcc([], 60_000)).toEqual([]);
  });

  it("returns empty for zero duration", () => {
    expect(classifySessionAcc(sine(2, 10_000), 0)).toEqual([]);
  });

  it("classifies a 1.2 Hz signal as walk", () => {
    const samples = sine(1.2, 30_000);
    const segs = classifySessionAcc(samples, 30_000);
    expect(segs.length).toBeGreaterThanOrEqual(1);
    expect(segs.every((s) => s.label === "walk")).toBe(true);
    expect(segs[0].stride_hz).toBeGreaterThan(1.0);
    expect(segs[0].stride_hz).toBeLessThan(1.5);
  });

  it("classifies a 2.6 Hz signal as trot", () => {
    const samples = sine(2.6, 30_000);
    const segs = classifySessionAcc(samples, 30_000);
    expect(segs.every((s) => s.label === "trot")).toBe(true);
  });

  it("classifies a 4.0 Hz signal as canter", () => {
    const samples = sine(4.0, 30_000);
    const segs = classifySessionAcc(samples, 30_000);
    expect(segs.every((s) => s.label === "canter")).toBe(true);
  });

  it("treats near-stationary signal as halt", () => {
    const segs = classifySessionAcc(flat(30_000, 1), 30_000);
    expect(segs.every((s) => s.label === "halt")).toBe(true);
  });

  it("returns not_sure for pure white noise (no periodic structure)", () => {
    const segs = classifySessionAcc(whiteNoise(30_000), 30_000);
    expect(segs.some((s) => s.label === "not_sure")).toBe(true);
  });

  it("splits a walk → trot → canter ride into ordered segments", () => {
    const samples = concat(
      sine(1.2, 30_000),
      sine(2.6, 30_000),
      sine(4.0, 30_000),
    );
    const segs = classifySessionAcc(samples, 90_000);
    expect(segs.length).toBeGreaterThanOrEqual(3);
    expect(segs[0].label).toBe("walk");
    expect(segs[segs.length - 1].label).toBe("canter");
    expect(segs.map((s) => s.label)).toContain("trot");
  });

  it("covers the full duration with contiguous segments", () => {
    const samples = sine(2.6, 60_000);
    const segs = classifySessionAcc(samples, 60_000);
    expect(segs[0].start_ms).toBe(0);
    expect(segs[segs.length - 1].end_ms).toBe(60_000);
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].start_ms).toBe(segs[i - 1].end_ms);
    }
  });

  it("merges a short canter blip inside a walk so it does not survive", () => {
    const samples = concat(
      sine(1.2, 20_000),
      sine(4.0, 2_000),
      sine(1.2, 20_000),
    );
    const segs = classifySessionAcc(samples, 42_000);
    expect(segs.every((s) => s.label === "walk")).toBe(true);
  });

  it("reports confidence between 0 and 1", () => {
    const segs = classifySessionAcc(sine(2.6, 30_000), 30_000);
    for (const s of segs) {
      expect(s.confidence).toBeGreaterThanOrEqual(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("exposes a stable algo version string", () => {
    expect(ACC_CLASSIFIER_ALGO_VERSION).toMatch(/^acc-/);
  });
});
