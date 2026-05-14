import { describe, expect, it } from "vitest";

import type { BucketAggregate } from "@/lib/prototype/aggregate";
import { buildComparisonPrompt, MODEL, PROMPT_VERSION } from "@/lib/prototype/prompt";

function bucket(overrides: Partial<BucketAggregate> = {}): BucketAggregate {
  return {
    session_count: 0,
    total_duration_min: 0,
    avg_duration_min: null,
    signal_event_seconds_per_min: null,
    avg_signal_events_per_session: null,
    avg_rr_cleaning_quality: null,
    avg_hrv_completeness_quality: null,
    avg_workload_quality: null,
    avg_hr_samples_per_min: null,
    ...overrides,
  };
}

describe("buildComparisonPrompt", () => {
  it("exports stable version constants", () => {
    expect(PROMPT_VERSION).toMatch(/^v\d+$/);
    expect(MODEL).toMatch(/^claude-/);
  });

  it("embeds both bucket counts and quality means", () => {
    const prompt = buildComparisonPrompt({
      baseline: bucket({
        session_count: 5,
        total_duration_min: 120.5,
        avg_duration_min: 24.1,
        signal_event_seconds_per_min: 1.23,
        avg_signal_events_per_session: 3.4,
        avg_rr_cleaning_quality: 0.82,
        avg_hrv_completeness_quality: 0.71,
        avg_workload_quality: 0.65,
        avg_hr_samples_per_min: 58.2,
      }),
      prototype: bucket({
        session_count: 3,
        total_duration_min: 60,
        avg_duration_min: 20,
        signal_event_seconds_per_min: 0.5,
        avg_signal_events_per_session: 1.2,
        avg_rr_cleaning_quality: 0.91,
        avg_hrv_completeness_quality: 0.85,
        avg_workload_quality: 0.78,
        avg_hr_samples_per_min: 59.8,
      }),
    });

    expect(prompt).toContain("baseline=5");
    expect(prompt).toContain("prototype=3");
    expect(prompt).toContain("0.82"); // baseline rr
    expect(prompt).toContain("0.91"); // prototype rr
    expect(prompt).toContain("BASELINE");
    expect(prompt).toContain("PROTOTYPE");
  });

  it("instructs Claude to say 'too early to tell' when a bucket is tiny", () => {
    const prompt = buildComparisonPrompt({
      baseline: bucket({ session_count: 10 }),
      prototype: bucket({ session_count: 1 }),
    });
    expect(prompt.toLowerCase()).toContain("too early to tell");
  });

  it("renders missing means as em-dash placeholders, not NaN", () => {
    const prompt = buildComparisonPrompt({
      baseline: bucket(),
      prototype: bucket(),
    });
    expect(prompt).not.toContain("NaN");
    expect(prompt).toContain("—");
  });
});
