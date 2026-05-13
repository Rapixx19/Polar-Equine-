import { describe, expect, it } from "vitest";

import {
  classifySession,
  type HRSample,
} from "@/lib/session/gait-classifier";

function flat(bpm: number, durationMs: number, hzMs = 1000): HRSample[] {
  const out: HRSample[] = [];
  for (let t = 0; t < durationMs; t += hzMs) out.push({ ts_ms: t, bpm });
  return out;
}

describe("classifySession", () => {
  it("returns a single not_sure segment when no samples", () => {
    const segs = classifySession([], 60_000);
    expect(segs).toHaveLength(1);
    expect(segs[0].label).toBe("not_sure");
    expect(segs[0].start_ms).toBe(0);
    expect(segs[0].end_ms).toBe(60_000);
  });

  it("classifies a flat low-HR ride as walk", () => {
    const samples = flat(90, 5 * 60_000);
    const segs = classifySession(samples, 5 * 60_000);
    expect(segs).toHaveLength(1);
    expect(segs[0].label).toBe("walk");
    expect(segs[0].avg_bpm).toBeGreaterThan(80);
  });

  it("classifies a flat high-HR ride as canter", () => {
    const samples = flat(160, 5 * 60_000);
    const segs = classifySession(samples, 5 * 60_000);
    expect(segs).toHaveLength(1);
    expect(segs[0].label).toBe("canter");
  });

  it("splits a ride with a sustained HR climb into multiple segments", () => {
    const walk = flat(90, 2 * 60_000);
    const trotSamples: HRSample[] = [];
    for (let t = 2 * 60_000; t < 4 * 60_000; t += 1000) {
      trotSamples.push({ ts_ms: t, bpm: 125 });
    }
    const canter: HRSample[] = [];
    for (let t = 4 * 60_000; t < 6 * 60_000; t += 1000) {
      canter.push({ ts_ms: t, bpm: 160 });
    }
    const segs = classifySession([...walk, ...trotSamples, ...canter], 6 * 60_000);
    expect(segs.length).toBeGreaterThanOrEqual(3);
    expect(segs[0].label).toBe("walk");
    expect(segs[segs.length - 1].label).toBe("canter");
  });

  it("merges segments shorter than 30s into their neighbor", () => {
    // 10s spike of canter inside a long walk should not survive
    const samples: HRSample[] = [];
    for (let t = 0; t < 5 * 60_000; t += 1000) {
      const bpm = t >= 60_000 && t < 70_000 ? 160 : 90;
      samples.push({ ts_ms: t, bpm });
    }
    const segs = classifySession(samples, 5 * 60_000);
    // After smoothing + merge, the 10s spike disappears.
    expect(segs.every((s) => s.label === "walk")).toBe(true);
  });

  it("covers the full duration with contiguous segments", () => {
    const samples = flat(120, 4 * 60_000);
    const segs = classifySession(samples, 4 * 60_000);
    expect(segs[0].start_ms).toBe(0);
    expect(segs[segs.length - 1].end_ms).toBe(4 * 60_000);
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].start_ms).toBe(segs[i - 1].end_ms);
    }
  });
});
