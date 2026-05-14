import { describe, expect, it } from "vitest";

import { buildInsightPrompt, type InsightInput } from "@/lib/insights/prompt";
import { buildInsightInput, summariseLabels } from "@/lib/insights/build-input";

const baseInput: InsightInput = {
  activity_type: "riding",
  started_at: "2026-05-13T10:00:00Z",
  duration_ms: 30 * 60 * 1000,
  metrics: { rmssd_ms: 35, sdnn_ms: 60, trimp_banister: 42, recovery_tau_s: 600 },
  labels: [
    { label: "walk", total_ms: 600_000, jump_count: 0 },
    { label: "trot", total_ms: 900_000, jump_count: 0 },
    { label: "canter", total_ms: 300_000, jump_count: 2 },
  ],
  hr_summary: {
    avg: 95,
    peak: 165,
    min: 55,
    time_z1_s: 200,
    time_z2_s: 500,
    time_z3_s: 600,
    time_z4_s: 400,
    time_z5_s: 100,
  },
};

describe("buildInsightPrompt", () => {
  it("includes duration, metrics, and label totals", () => {
    const prompt = buildInsightPrompt(baseInput);
    expect(prompt).toContain("30 min");
    expect(prompt).toContain("RMSSD: 35.0 ms");
    expect(prompt).toContain("TRIMP (Banister): 42.0");
    expect(prompt).toContain("walk: 10.0 min");
    expect(prompt).toContain("trot: 15.0 min");
    expect(prompt).toContain("canter: 5.0 min, 2 jumps");
  });

  it("renders dashes for missing metrics rather than NaN/undefined", () => {
    const prompt = buildInsightPrompt({
      ...baseInput,
      metrics: null,
      hr_summary: { avg: null, peak: null, min: null },
    });
    expect(prompt).not.toMatch(/NaN/);
    expect(prompt).not.toMatch(/undefined/);
    expect(prompt).toContain("avg: —");
    expect(prompt).toContain("RMSSD: —");
  });

  it("forbids naming the rider or horse in the instructions", () => {
    const prompt = buildInsightPrompt(baseInput);
    expect(prompt).toMatch(/Do not name the rider or horse/);
  });
});

describe("summariseLabels", () => {
  it("rolls up duration and jumps per label, preferring corrected fields", () => {
    const out = summariseLabels([
      {
        auto_start_ms: 0,
        auto_end_ms: 60_000,
        auto_label_type: "walk",
        corrected_start_ms: null,
        corrected_end_ms: null,
        corrected_label_type: null,
        corrected_jump_count: 0,
      },
      {
        auto_start_ms: 60_000,
        auto_end_ms: 120_000,
        auto_label_type: "walk",
        corrected_start_ms: 60_000,
        corrected_end_ms: 120_000,
        corrected_label_type: "trot",
        corrected_jump_count: 1,
      },
    ]);
    expect(out).toHaveLength(2);
    const walk = out.find((l) => l.label === "walk");
    const trot = out.find((l) => l.label === "trot");
    expect(walk?.total_ms).toBe(60_000);
    expect(trot?.total_ms).toBe(60_000);
    expect(trot?.jump_count).toBe(1);
  });
});

describe("buildInsightInput", () => {
  it("computes duration_ms from session start/end and passes metrics through", () => {
    const out = buildInsightInput(
      {
        activity_type: "riding",
        start_time: "2026-05-13T10:00:00Z",
        end_time: "2026-05-13T10:45:00Z",
      },
      { hr_avg: 100, hr_peak: 170, time_z2_s: 500 },
      [],
    );
    expect(out.duration_ms).toBe(45 * 60 * 1000);
    expect(out.hr_summary.avg).toBe(100);
    expect(out.hr_summary.time_z2_s).toBe(500);
  });

  it("returns null duration when end_time is missing", () => {
    const out = buildInsightInput(
      { activity_type: "riding", start_time: "2026-05-13T10:00:00Z", end_time: null },
      null,
      [],
    );
    expect(out.duration_ms).toBeNull();
    expect(out.hr_summary.avg).toBeNull();
  });
});
