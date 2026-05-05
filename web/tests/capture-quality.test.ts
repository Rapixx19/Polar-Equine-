import { describe, expect, it } from "vitest";

import { deriveState } from "@/lib/ble/capture-quality";
import { aggregateSummary, emptySummary, freezeSummary, type QualitySummary } from "@/lib/ble/capture-quality";

describe("deriveState", () => {
  it("returns good when contact is good and correction rate < 5%", () => {
    expect(
      deriveState({ contact: "contact", correctionRate: 0.04, msSinceLastSample: 100 }),
    ).toBe("good");
  });

  it("returns weak when contact is poor regardless of correction rate", () => {
    expect(
      deriveState({ contact: "no_contact", correctionRate: 0.0, msSinceLastSample: 100 }),
    ).toBe("weak");
  });

  it("returns weak when correction rate >= 5% (open-ended above)", () => {
    expect(
      deriveState({ contact: "contact", correctionRate: 0.10, msSinceLastSample: 100 }),
    ).toBe("weak");
    expect(
      deriveState({ contact: "contact", correctionRate: 0.25, msSinceLastSample: 100 }),
    ).toBe("weak");
    expect(
      deriveState({ contact: "contact", correctionRate: 0.60, msSinceLastSample: 100 }),
    ).toBe("weak");
  });

  it("maps contact='unsupported' to good (old straps that don't report contact)", () => {
    expect(
      deriveState({ contact: "unsupported", correctionRate: 0.0, msSinceLastSample: 100 }),
    ).toBe("good");
  });

  it("maps contact='no_contact' to weak (not lost — H10 has no 'bad' value)", () => {
    expect(
      deriveState({ contact: "no_contact", correctionRate: 0.0, msSinceLastSample: 100 }),
    ).toBe("weak");
  });

  it("returns lost when no notifications in 5 s (silence-timeout — only path to lost)", () => {
    expect(
      deriveState({ contact: "contact", correctionRate: 0.0, msSinceLastSample: 5001 }),
    ).toBe("lost");
  });

  it("returns lost when silence-timeout overrides good contact + zero correction", () => {
    // Silence rule wins regardless of other fields — proves it's the only escalation path.
    expect(
      deriveState({ contact: "contact", correctionRate: 0.50, msSinceLastSample: 6000 }),
    ).toBe("lost");
  });
});

describe("aggregateSummary", () => {
  it("returns the empty summary unchanged when no windows yet", () => {
    expect(emptySummary()).toEqual({
      goodPct: 0,
      weakPct: 0,
      lostPct: 0,
      windowCount: 0,
    });
  });

  it("increments good count and recomputes percentages incrementally", () => {
    let s: QualitySummary = emptySummary();
    s = aggregateSummary(s, "good");
    s = aggregateSummary(s, "good");
    s = aggregateSummary(s, "weak");
    expect(s.windowCount).toBe(3);
    expect(s.goodPct).toBeCloseTo(2 / 3, 5);
    expect(s.weakPct).toBeCloseTo(1 / 3, 5);
    expect(s.lostPct).toBe(0);
  });

  it("does not mutate the input summary (returns a new object)", () => {
    const before: QualitySummary = emptySummary();
    const after = aggregateSummary(before, "lost");
    expect(before.windowCount).toBe(0);
    expect(after.windowCount).toBe(1);
    expect(after).not.toBe(before);
  });
});

describe("freezeSummary", () => {
  it("returns the current summary on first freeze", () => {
    const current: QualitySummary = { goodPct: 0.8, weakPct: 0.2, lostPct: 0, windowCount: 5 };
    expect(freezeSummary(current, null)).toBe(current);
  });

  it("returns the same reference on repeated freeze calls (stability guarantee)", () => {
    const original: QualitySummary = { goodPct: 0.8, weakPct: 0.2, lostPct: 0, windowCount: 5 };
    const firstFreeze = freezeSummary(original, null);
    // Simulate the live summary continuing to update after freeze:
    const liveAfter: QualitySummary = { goodPct: 0.5, weakPct: 0.5, lostPct: 0, windowCount: 10 };
    const secondFreeze = freezeSummary(liveAfter, firstFreeze);
    expect(secondFreeze).toBe(firstFreeze);
    expect(secondFreeze.windowCount).toBe(5); // not 10 — frozen reference wins
  });

  it("ignores subsequent calls even with mutated frozen reference", () => {
    const original: QualitySummary = { goodPct: 1, weakPct: 0, lostPct: 0, windowCount: 1 };
    const frozen = freezeSummary(original, null);
    const next = freezeSummary({ goodPct: 0, weakPct: 1, lostPct: 0, windowCount: 99 }, frozen);
    expect(next).toBe(frozen);
  });
});

import { computeCorrectionRate } from "@/lib/ble/capture-quality";
import { buildHrStream } from "./helpers/hr-stream";

describe("computeCorrectionRate", () => {
  it("returns 0 for fewer than 2 RR samples", () => {
    expect(computeCorrectionRate([])).toBe(0);
    expect(computeCorrectionRate([800])).toBe(0);
  });

  it("returns 0 when all RR are flat (no jumps)", () => {
    const rr = buildHrStream({ count: 60, baseRrMs: 800 }).flatMap((s) => s.rr_ms);
    expect(computeCorrectionRate(rr)).toBe(0);
  });

  it("returns 0.10 when 1 in 10 beats jumps >20% (first-pass Lipponen-Tarvainen gate)", () => {
    const rr = buildHrStream({ count: 60, correctionPct: 0.1 }).flatMap((s) => s.rr_ms);
    // 6 jumps in 60 beats but only inter-beat deltas count: 5 jumps after the first reset
    expect(computeCorrectionRate(rr)).toBeCloseTo(0.10, 1);
  });
});
