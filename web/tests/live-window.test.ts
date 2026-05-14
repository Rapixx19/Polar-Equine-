import { describe, expect, it } from "vitest";

import {
  inferCurrentGait,
  magnitudeWindow,
  rebaseToZero,
  secondsSince,
} from "@/lib/session/live-window";
import type { AccSample } from "@/lib/session/acc-magnitude";

function sine(freqHz: number, durationMs: number, startTs = 100_000, sampleHz = 200): AccSample[] {
  const out: AccSample[] = [];
  const period = 1000 / sampleHz;
  const n = Math.round(durationMs / period);
  for (let i = 0; i < n; i++) {
    const t = startTs + i * period;
    const phase = 2 * Math.PI * freqHz * ((t - startTs) / 1000);
    out.push({ ts_ms: t, ax: 0, ay: 0, az: 1 + 0.35 * Math.sin(phase) });
  }
  return out;
}

describe("rebaseToZero", () => {
  it("subtracts the first timestamp", () => {
    const rebased = rebaseToZero([
      { ts_ms: 100, x: 1 },
      { ts_ms: 110, x: 2 },
    ]);
    expect(rebased[0].ts_ms).toBe(0);
    expect(rebased[1].ts_ms).toBe(10);
  });

  it("handles empty input", () => {
    expect(rebaseToZero([])).toEqual([]);
  });
});

describe("magnitudeWindow", () => {
  it("downsamples to roughly the target rate", () => {
    const samples = sine(2, 4000); // 4 s × 200 Hz = 800 samples
    const window = magnitudeWindow(samples, 50); // target ~200 points over 4 s
    expect(window.length).toBeGreaterThan(150);
    expect(window.length).toBeLessThan(250);
    for (const p of window) {
      expect(p.m).toBeGreaterThan(0.6);
      expect(p.m).toBeLessThan(1.4);
    }
  });

  it("returns empty array for empty input", () => {
    expect(magnitudeWindow([])).toEqual([]);
  });
});

describe("inferCurrentGait", () => {
  it("returns null when fewer than 200 samples", () => {
    expect(inferCurrentGait([])).toBeNull();
    expect(inferCurrentGait(sine(2, 500))).toBeNull();
  });

  it("classifies a 2.6 Hz window as trot", () => {
    const gait = inferCurrentGait(sine(2.6, 4000));
    expect(gait).not.toBeNull();
    expect(gait?.label).toBe("trot");
    expect(gait?.confidence).toBeGreaterThan(0.25);
    expect(gait?.algo_version).toMatch(/^acc-/);
  });

  it("classifies a 1.2 Hz window as walk regardless of absolute timestamps", () => {
    const gait = inferCurrentGait(sine(1.2, 4000, 9_999_000));
    expect(gait?.label).toBe("walk");
  });
});

describe("secondsSince", () => {
  it("returns Infinity for null/undefined", () => {
    expect(secondsSince(null, Date.now())).toBe(Infinity);
    expect(secondsSince(undefined, Date.now())).toBe(Infinity);
  });

  it("computes elapsed seconds from ISO timestamp", () => {
    const now = Date.now();
    const fiveSecAgo = new Date(now - 5000).toISOString();
    expect(secondsSince(fiveSecAgo, now)).toBeCloseTo(5, 1);
  });

  it("clamps negative deltas to zero", () => {
    const now = Date.now();
    const future = new Date(now + 5000).toISOString();
    expect(secondsSince(future, now)).toBe(0);
  });
});
