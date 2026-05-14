import { describe, expect, it } from "vitest";

import { aggregateBucket, type SessionQualityRow } from "@/lib/prototype/aggregate";

function row(overrides: Partial<SessionQualityRow> = {}): SessionQualityRow {
  return {
    session_id: "s1",
    duration_ms: 60_000,
    signal_event_seconds: 0,
    signal_event_count: 0,
    rr_cleaning_quality: null,
    hrv_completeness_quality: null,
    workload_quality: null,
    hr_sample_count: 0,
    ...overrides,
  };
}

describe("aggregateBucket", () => {
  it("returns zeros / nulls for an empty bucket", () => {
    const agg = aggregateBucket([]);
    expect(agg.session_count).toBe(0);
    expect(agg.total_duration_min).toBe(0);
    expect(agg.avg_duration_min).toBeNull();
    expect(agg.signal_event_seconds_per_min).toBeNull();
    expect(agg.avg_signal_events_per_session).toBeNull();
    expect(agg.avg_rr_cleaning_quality).toBeNull();
    expect(agg.avg_hrv_completeness_quality).toBeNull();
    expect(agg.avg_workload_quality).toBeNull();
    expect(agg.avg_hr_samples_per_min).toBeNull();
  });

  it("sums durations and counts sessions", () => {
    const agg = aggregateBucket([
      row({ session_id: "a", duration_ms: 5 * 60_000 }),
      row({ session_id: "b", duration_ms: 15 * 60_000 }),
    ]);
    expect(agg.session_count).toBe(2);
    expect(agg.total_duration_min).toBe(20);
    expect(agg.avg_duration_min).toBe(10);
  });

  it("normalises signal event seconds per total minute", () => {
    const agg = aggregateBucket([
      row({ duration_ms: 10 * 60_000, signal_event_seconds: 30, signal_event_count: 2 }),
    ]);
    // 30s of bad signal over 10 min = 3 s/min.
    expect(agg.signal_event_seconds_per_min).toBeCloseTo(3);
    expect(agg.avg_signal_events_per_session).toBe(2);
  });

  it("means quality scores while ignoring nulls", () => {
    const agg = aggregateBucket([
      row({ rr_cleaning_quality: 0.8, hrv_completeness_quality: 0.6 }),
      row({ rr_cleaning_quality: null, hrv_completeness_quality: 0.4 }),
      row({ rr_cleaning_quality: 0.6, hrv_completeness_quality: null }),
    ]);
    expect(agg.avg_rr_cleaning_quality).toBeCloseTo(0.7);
    expect(agg.avg_hrv_completeness_quality).toBeCloseTo(0.5);
  });

  it("computes hr samples per minute per session, then averages", () => {
    // Session A: 600 samples / 10 min = 60 spm
    // Session B: 100 samples / 5  min = 20 spm
    // Average: 40 spm
    const agg = aggregateBucket([
      row({ session_id: "a", duration_ms: 10 * 60_000, hr_sample_count: 600 }),
      row({ session_id: "b", duration_ms: 5 * 60_000, hr_sample_count: 100 }),
    ]);
    expect(agg.avg_hr_samples_per_min).toBeCloseTo(40);
  });

  it("excludes sessions with no duration from samples-per-min", () => {
    const agg = aggregateBucket([
      row({ session_id: "a", duration_ms: null, hr_sample_count: 999 }),
      row({ session_id: "b", duration_ms: 10 * 60_000, hr_sample_count: 600 }),
    ]);
    expect(agg.avg_hr_samples_per_min).toBeCloseTo(60);
  });
});
