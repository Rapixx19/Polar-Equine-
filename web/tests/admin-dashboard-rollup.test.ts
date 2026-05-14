import { describe, expect, it } from "vitest";

import {
  buildKpis,
  buildRiderRollups,
  sortRollupsByActivity,
  type DashboardRiderProfile,
  type DashboardSessionRow,
} from "@/lib/admin/dashboard-rollup";

function profile(overrides: Partial<DashboardRiderProfile> & { id: string; display_name: string }): DashboardRiderProfile {
  return {
    is_admin: false,
    session_quota_target: 30,
    program_end_date: null,
    admin_notes: null,
    next_focus: null,
    created_at: null,
    ...overrides,
  };
}

function session(overrides: Partial<DashboardSessionRow> & { rider_id: string; start_time: string }): DashboardSessionRow {
  return {
    end_time: null,
    has_prototype_mount: false,
    rr_cleaning_quality: null,
    hrv_completeness_quality: null,
    workload_quality: null,
    ...overrides,
  };
}

describe("buildRiderRollups", () => {
  // Pin a fake "now" so the sparkline buckets and active_last_7d are deterministic.
  const now = new Date("2026-05-14T12:00:00.000Z");

  it("returns one rollup per profile, including riders with zero sessions", () => {
    const rollups = buildRiderRollups(
      [profile({ id: "a", display_name: "Alice" }), profile({ id: "b", display_name: "Bob" })],
      [session({ rider_id: "a", start_time: "2026-05-13T10:00:00Z", end_time: "2026-05-13T10:30:00Z" })],
      now,
    );
    expect(rollups).toHaveLength(2);
    const a = rollups.find((r) => r.id === "a")!;
    const b = rollups.find((r) => r.id === "b")!;
    expect(a.session_count).toBe(1);
    expect(b.session_count).toBe(0);
    expect(b.last_session_at).toBeNull();
    expect(b.avg_quality).toBeNull();
  });

  it("computes pct_of_dataset from completed ride minutes", () => {
    const rollups = buildRiderRollups(
      [profile({ id: "a", display_name: "A" }), profile({ id: "b", display_name: "B" })],
      [
        session({ rider_id: "a", start_time: "2026-05-13T10:00:00Z", end_time: "2026-05-13T10:30:00Z" }), // 30 min
        session({ rider_id: "b", start_time: "2026-05-13T11:00:00Z", end_time: "2026-05-13T11:10:00Z" }), // 10 min
      ],
      now,
    );
    const a = rollups.find((r) => r.id === "a")!;
    const b = rollups.find((r) => r.id === "b")!;
    expect(a.pct_of_dataset).toBeCloseTo(0.75);
    expect(b.pct_of_dataset).toBeCloseTo(0.25);
  });

  it("ignores active (no end_time) sessions in ride-minute totals but still counts them as a session", () => {
    const rollups = buildRiderRollups(
      [profile({ id: "a", display_name: "A" })],
      [session({ rider_id: "a", start_time: "2026-05-14T11:30:00Z", end_time: null })],
      now,
    );
    expect(rollups[0].session_count).toBe(1);
    expect(rollups[0].total_ride_minutes).toBe(0);
  });

  it("counts prototype-tagged sessions separately", () => {
    const rollups = buildRiderRollups(
      [profile({ id: "a", display_name: "A" })],
      [
        session({ rider_id: "a", start_time: "2026-05-13T10:00:00Z", end_time: "2026-05-13T10:30:00Z", has_prototype_mount: true }),
        session({ rider_id: "a", start_time: "2026-05-12T10:00:00Z", end_time: "2026-05-12T10:30:00Z", has_prototype_mount: false }),
      ],
      now,
    );
    expect(rollups[0].prototype_session_count).toBe(1);
    expect(rollups[0].session_count).toBe(2);
  });

  it("averages quality across rr/hrv/workload, dropping nulls", () => {
    const rollups = buildRiderRollups(
      [profile({ id: "a", display_name: "A" })],
      [
        session({
          rider_id: "a",
          start_time: "2026-05-13T10:00:00Z",
          end_time: "2026-05-13T10:30:00Z",
          rr_cleaning_quality: 0.8,
          hrv_completeness_quality: 0.6,
          workload_quality: null,
        }),
        session({
          rider_id: "a",
          start_time: "2026-05-12T10:00:00Z",
          end_time: "2026-05-12T10:30:00Z",
          rr_cleaning_quality: 1.0,
          hrv_completeness_quality: 1.0,
          workload_quality: 1.0,
        }),
      ],
      now,
    );
    // Session 1 mean = 0.7, session 2 mean = 1.0, overall = 0.85
    expect(rollups[0].avg_quality).toBeCloseTo(0.85);
  });

  it("flags active_last_7d for sessions in the last week", () => {
    const rollups = buildRiderRollups(
      [profile({ id: "a", display_name: "A" }), profile({ id: "b", display_name: "B" })],
      [
        session({ rider_id: "a", start_time: "2026-05-13T10:00:00Z", end_time: "2026-05-13T10:30:00Z" }),
        session({ rider_id: "b", start_time: "2026-04-01T10:00:00Z", end_time: "2026-04-01T10:30:00Z" }),
      ],
      now,
    );
    expect(rollups.find((r) => r.id === "a")!.active_last_7d).toBe(true);
    expect(rollups.find((r) => r.id === "b")!.active_last_7d).toBe(false);
  });

  it("daily_sessions has length 14 and counts the right buckets", () => {
    const rollups = buildRiderRollups(
      [profile({ id: "a", display_name: "A" })],
      [
        session({ rider_id: "a", start_time: "2026-05-14T08:00:00Z", end_time: "2026-05-14T08:30:00Z" }), // today
        session({ rider_id: "a", start_time: "2026-05-14T09:00:00Z", end_time: "2026-05-14T09:30:00Z" }), // today (second)
        session({ rider_id: "a", start_time: "2026-05-13T08:00:00Z", end_time: "2026-05-13T08:30:00Z" }), // yesterday
      ],
      now,
    );
    expect(rollups[0].daily_sessions).toHaveLength(14);
    // Today is the last bucket.
    expect(rollups[0].daily_sessions[13]).toBeGreaterThanOrEqual(1);
    // Sum should match the 3 in-window sessions.
    expect(rollups[0].daily_sessions.reduce((s, x) => s + x, 0)).toBe(3);
  });
});

describe("buildKpis", () => {
  const now = new Date("2026-05-14T12:00:00.000Z");

  it("returns null prototype_share and avg_quality on an empty corpus", () => {
    const rollups = buildRiderRollups([profile({ id: "a", display_name: "A" })], [], now);
    const kpis = buildKpis(rollups, []);
    expect(kpis.total_sessions).toBe(0);
    expect(kpis.total_ride_hours).toBe(0);
    expect(kpis.prototype_share).toBeNull();
    expect(kpis.avg_quality).toBeNull();
    expect(kpis.rider_count).toBe(1);
    expect(kpis.active_riders_7d).toBe(0);
  });

  it("computes prototype share as a fraction of total sessions", () => {
    const sessions = [
      session({ rider_id: "a", start_time: "2026-05-13T10:00:00Z", end_time: "2026-05-13T10:30:00Z", has_prototype_mount: true }),
      session({ rider_id: "a", start_time: "2026-05-13T12:00:00Z", end_time: "2026-05-13T12:30:00Z", has_prototype_mount: false }),
      session({ rider_id: "a", start_time: "2026-05-13T13:00:00Z", end_time: "2026-05-13T13:30:00Z", has_prototype_mount: false }),
      session({ rider_id: "a", start_time: "2026-05-13T14:00:00Z", end_time: "2026-05-13T14:30:00Z", has_prototype_mount: false }),
    ];
    const rollups = buildRiderRollups([profile({ id: "a", display_name: "A" })], sessions, now);
    const kpis = buildKpis(rollups, sessions);
    expect(kpis.prototype_share).toBeCloseTo(0.25);
    expect(kpis.total_sessions).toBe(4);
    expect(kpis.total_ride_hours).toBeCloseTo(2.0);
  });
});

describe("sortRollupsByActivity", () => {
  const now = new Date("2026-05-14T12:00:00.000Z");

  it("puts riders with sessions before riders without, then by most recent", () => {
    const rollups = buildRiderRollups(
      [
        profile({ id: "never", display_name: "Zoe" }),
        profile({ id: "old", display_name: "Alice" }),
        profile({ id: "recent", display_name: "Bob" }),
      ],
      [
        session({ rider_id: "old", start_time: "2026-04-01T10:00:00Z", end_time: "2026-04-01T10:30:00Z" }),
        session({ rider_id: "recent", start_time: "2026-05-13T10:00:00Z", end_time: "2026-05-13T10:30:00Z" }),
      ],
      now,
    );
    const sorted = sortRollupsByActivity(rollups);
    expect(sorted.map((r) => r.id)).toEqual(["recent", "old", "never"]);
  });
});
