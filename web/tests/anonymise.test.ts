import { describe, expect, it } from "vitest";

import { anonymiseBundle, buildPseudonymMap } from "@/lib/admin/anonymise";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const RIDER_ID = "33333333-3333-4333-8333-333333333333";
const HORSE_ID = "44444444-4444-4444-8444-444444444444";

describe("buildPseudonymMap", () => {
  it("assigns letters in input order", () => {
    const map = buildPseudonymMap(["a", "b"], "Rider");
    expect(map.get("a")).toBe("Rider-A");
    expect(map.get("b")).toBe("Rider-B");
  });

  it("deduplicates repeated ids", () => {
    const map = buildPseudonymMap(["a", "a", "b"], "Horse");
    expect(map.get("a")).toBe("Horse-A");
    expect(map.get("b")).toBe("Horse-B");
  });

  it("rolls over to AA after Z", () => {
    const ids = Array.from({ length: 27 }, (_, i) => `id-${i}`);
    const map = buildPseudonymMap(ids, "Rider");
    expect(map.get("id-25")).toBe("Rider-Z");
    expect(map.get("id-26")).toBe("Rider-AA");
  });
});

describe("anonymiseBundle", () => {
  it("computes duration_ms from start/end and uses corrected fields when present", () => {
    const start = "2026-05-13T10:00:00.000Z";
    const end = "2026-05-13T10:30:00.000Z";
    const out = anonymiseBundle({
      session: {
        id: SESSION_ID,
        rider_id: RIDER_ID,
        horse_id: HORSE_ID,
        activity_type: "riding",
        start_time: start,
        end_time: end,
        status: "approved",
      },
      session_metrics: { algo_version: "0.3.1", hr_avg: 75 },
      samples_hr: [{ timestamp_ms: 0, hr_bpm: 70, rr_ms: 850, contact: true }],
      label_corrections: [
        {
          auto_start_ms: 0,
          auto_end_ms: 1000,
          auto_label_type: "trot",
          auto_jump_count: 0,
          corrected_start_ms: 100,
          corrected_end_ms: 900,
          corrected_label_type: "canter",
          corrected_jump_count: 2,
          correction_kind: "relabelled",
          algo_version: "manual-v1",
        },
      ],
      export_id: "exp-1",
      exported_at: "2026-05-13T11:00:00Z",
    });
    expect(out.session.duration_ms).toBe(30 * 60 * 1000);
    expect(out.session.rider_pseudonym).toBe("Rider-A");
    expect(out.session.horse_pseudonym).toBe("Horse-A");
    expect(out.manifest.algo_version).toBe("0.3.1");
    expect(out.samples_hr[0].t_ms).toBe(0);
    expect(out.label_corrections[0].start_ms).toBe(100);
    expect(out.label_corrections[0].label).toBe("canter");
    expect(out.label_corrections[0].jump_count).toBe(2);
  });

  it("falls back to auto_* fields when corrected_* are null", () => {
    const out = anonymiseBundle({
      session: {
        id: SESSION_ID,
        rider_id: RIDER_ID,
        horse_id: HORSE_ID,
        activity_type: "riding",
        start_time: "2026-05-13T10:00:00.000Z",
        end_time: null,
        status: "completed",
      },
      session_metrics: null,
      samples_hr: [],
      label_corrections: [
        {
          auto_start_ms: 0,
          auto_end_ms: 1000,
          auto_label_type: "walk",
          auto_jump_count: 0,
          corrected_start_ms: null,
          corrected_end_ms: null,
          corrected_label_type: null,
          corrected_jump_count: 0,
          correction_kind: "approved",
          algo_version: "manual-v1",
        },
      ],
      export_id: "exp-2",
      exported_at: "2026-05-13T11:00:00Z",
    });
    expect(out.session.duration_ms).toBeNull();
    expect(out.manifest.algo_version).toBeNull();
    expect(out.label_corrections[0].label).toBe("walk");
    expect(out.label_corrections[0].start_ms).toBe(0);
  });

  it("strips PII: bundle contains no rider/horse ids in the JSON", () => {
    const out = anonymiseBundle({
      session: {
        id: SESSION_ID,
        rider_id: RIDER_ID,
        horse_id: HORSE_ID,
        activity_type: "riding",
        start_time: "2026-05-13T10:00:00.000Z",
        end_time: "2026-05-13T10:30:00.000Z",
        status: "approved",
      },
      session_metrics: null,
      samples_hr: [],
      label_corrections: [],
      export_id: "exp-3",
      exported_at: "2026-05-13T11:00:00Z",
    });
    const json = JSON.stringify(out);
    expect(json.includes(RIDER_ID)).toBe(false);
    expect(json.includes(HORSE_ID)).toBe(false);
  });
});
