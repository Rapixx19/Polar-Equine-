import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchHomeSummary, relativeFromIso } from "@/lib/home/home-summary";
import type { Database } from "@/lib/supabase/types";

const RIDER_ID = "44444444-4444-4444-8444-444444444444";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-05-06T12:00:00.000Z");

type Row = Record<string, unknown> | null;

function buildClient(row: Row): SupabaseClient<Database> {
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: row, error: null }),
            }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;
  return client;
}

describe("fetchHomeSummary", () => {
  it("returns empty when there is no session row", async () => {
    const summary = await fetchHomeSummary(buildClient(null), RIDER_ID, NOW);
    expect(summary.state).toBe("empty");
  });

  it("returns live for an active session", async () => {
    const summary = await fetchHomeSummary(
      buildClient({
        id: SESSION_ID,
        start_time: "2026-05-06T11:30:00.000Z",
        end_time: null,
        status: "active",
        activity_type: "riding",
        riding_subtype: "heavy_jumping",
        activity_note: null,
        horses: { name: "Luna" },
        session_metrics: null,
      }),
      RIDER_ID,
      NOW,
    );
    expect(summary.state).toBe("live");
    if (summary.state !== "live") return;
    expect(summary.session.id).toBe(SESSION_ID);
    expect(summary.session.horseName).toBe("Luna");
    expect(summary.session.activityLabel).toBe("Riding · Heavy jumping");
    expect(summary.session.startedAtRelative).toBe("30m ago");
  });

  it("returns recap for a completed session with metrics", async () => {
    const summary = await fetchHomeSummary(
      buildClient({
        id: SESSION_ID,
        start_time: "2026-05-06T09:00:00.000Z",
        end_time: "2026-05-06T10:00:00.000Z",
        status: "completed",
        activity_type: "riding",
        riding_subtype: "heavy_jumping",
        activity_note: null,
        horses: { name: "Luna" },
        session_metrics: { hr_avg: 142, hr_peak: 178, duration_s: 2520 },
      }),
      RIDER_ID,
      NOW,
    );
    expect(summary.state).toBe("recap");
    if (summary.state !== "recap") return;
    expect(summary.session.horseName).toBe("Luna");
    expect(summary.session.activityLabel).toBe("Riding · Heavy jumping");
    expect(summary.session.endedAtRelative).toBe("2h ago");
    expect(summary.session.durationMin).toBe(42);
    expect(summary.session.hrAvg).toBe(142);
    expect(summary.session.hrPeak).toBe(178);
  });

  it("falls back to 'Horse' when horse is missing", async () => {
    const summary = await fetchHomeSummary(
      buildClient({
        id: SESSION_ID,
        start_time: "2026-05-06T09:00:00.000Z",
        end_time: "2026-05-06T10:00:00.000Z",
        status: "completed",
        activity_type: "stall",
        riding_subtype: null,
        activity_note: null,
        horses: null,
        session_metrics: null,
      }),
      RIDER_ID,
      NOW,
    );
    if (summary.state !== "recap") throw new Error("expected recap");
    expect(summary.session.horseName).toBe("Horse");
    expect(summary.session.activityLabel).toBe("Stall");
    expect(summary.session.durationMin).toBeNull();
  });

  it("uses activity_note as the label when activity_type is 'other'", async () => {
    const summary = await fetchHomeSummary(
      buildClient({
        id: SESSION_ID,
        start_time: "2026-05-06T11:55:00.000Z",
        end_time: null,
        status: "active",
        activity_type: "other",
        riding_subtype: null,
        activity_note: "Polo match",
        horses: { name: "Luna" },
        session_metrics: null,
      }),
      RIDER_ID,
      NOW,
    );
    if (summary.state !== "live") throw new Error("expected live");
    expect(summary.session.activityLabel).toBe("Polo match");
  });

  it("returns the base label when riding has no subtype", async () => {
    const summary = await fetchHomeSummary(
      buildClient({
        id: SESSION_ID,
        start_time: "2026-05-06T11:55:00.000Z",
        end_time: null,
        status: "active",
        activity_type: "riding",
        riding_subtype: null,
        activity_note: null,
        horses: { name: "Luna" },
        session_metrics: null,
      }),
      RIDER_ID,
      NOW,
    );
    if (summary.state !== "live") throw new Error("expected live");
    expect(summary.session.activityLabel).toBe("Riding");
  });
});

describe("relativeFromIso", () => {
  it("returns 'just now' for sub-minute deltas", () => {
    expect(relativeFromIso("2026-05-06T11:59:50.000Z", NOW)).toBe("just now");
  });

  it("returns minutes for under-an-hour deltas", () => {
    expect(relativeFromIso("2026-05-06T11:30:00.000Z", NOW)).toBe("30m ago");
  });

  it("returns hours for under-a-day deltas", () => {
    expect(relativeFromIso("2026-05-06T08:00:00.000Z", NOW)).toBe("4h ago");
  });

  it("returns 'yesterday' for ~1-day deltas", () => {
    expect(relativeFromIso("2026-05-05T12:00:00.000Z", NOW)).toBe("yesterday");
  });

  it("returns days for under-a-week deltas", () => {
    expect(relativeFromIso("2026-05-03T12:00:00.000Z", NOW)).toBe("3d ago");
  });

  it("returns weeks for older deltas", () => {
    expect(relativeFromIso("2026-04-15T12:00:00.000Z", NOW)).toBe("3w ago");
  });
});
