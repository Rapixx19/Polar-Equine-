import { describe, expect, it } from "vitest";

import {
  buildHorseKpis,
  buildHorseRollups,
  sortHorseRollupsByActivity,
  type HorseProfile,
  type HorseSessionRow,
} from "@/lib/admin/horse-rollup";

function horse(overrides: Partial<HorseProfile> & { id: string; name: string }): HorseProfile {
  return {
    target_session_count: null,
    target_ride_minutes: null,
    admin_notes: null,
    ...overrides,
  };
}

function session(
  overrides: Partial<HorseSessionRow> & { horse_id: string; start_time: string },
): HorseSessionRow {
  return {
    end_time: null,
    ...overrides,
  };
}

describe("buildHorseRollups", () => {
  // Pinned "now" keeps active_last_7d deterministic.
  const now = new Date("2026-05-14T12:00:00.000Z");

  it("returns one rollup per horse, including horses with zero sessions", () => {
    const rollups = buildHorseRollups(
      [horse({ id: "a", name: "Apollo" }), horse({ id: "b", name: "Brego" })],
      [session({ horse_id: "a", start_time: "2026-05-13T10:00:00Z", end_time: "2026-05-13T10:30:00Z" })],
      now,
    );
    expect(rollups).toHaveLength(2);
    expect(rollups.find((r) => r.id === "a")!.session_count).toBe(1);
    expect(rollups.find((r) => r.id === "b")!.session_count).toBe(0);
    expect(rollups.find((r) => r.id === "b")!.last_session_at).toBeNull();
  });

  it("ignores sessions whose horse_id is null", () => {
    const rollups = buildHorseRollups(
      [horse({ id: "a", name: "Apollo" })],
      [
        session({ horse_id: "a", start_time: "2026-05-13T10:00:00Z", end_time: "2026-05-13T10:30:00Z" }),
        // @ts-expect-error — checking that the runtime filter catches null
        session({ horse_id: null, start_time: "2026-05-13T11:00:00Z", end_time: "2026-05-13T11:30:00Z" }),
      ],
      now,
    );
    expect(rollups[0].session_count).toBe(1);
    expect(rollups[0].total_ride_minutes).toBe(30);
  });

  it("computes session_pct only when target_session_count is set", () => {
    const rollups = buildHorseRollups(
      [
        horse({ id: "with", name: "WithTarget", target_session_count: 4 }),
        horse({ id: "without", name: "NoTarget" }),
      ],
      [
        session({ horse_id: "with", start_time: "2026-05-13T10:00:00Z", end_time: "2026-05-13T10:30:00Z" }),
        session({ horse_id: "with", start_time: "2026-05-12T10:00:00Z", end_time: "2026-05-12T10:30:00Z" }),
      ],
      now,
    );
    expect(rollups.find((r) => r.id === "with")!.session_pct).toBeCloseTo(0.5);
    expect(rollups.find((r) => r.id === "without")!.session_pct).toBeNull();
  });

  it("computes minutes_pct only when target_ride_minutes is set", () => {
    const rollups = buildHorseRollups(
      [horse({ id: "a", name: "Apollo", target_ride_minutes: 60 })],
      [
        session({ horse_id: "a", start_time: "2026-05-13T10:00:00Z", end_time: "2026-05-13T10:30:00Z" }),
        session({ horse_id: "a", start_time: "2026-05-12T10:00:00Z", end_time: "2026-05-12T10:15:00Z" }),
      ],
      now,
    );
    expect(rollups[0].minutes_pct).toBeCloseTo(45 / 60);
  });

  it("session_pct > 1 when actual exceeds target (overachiever)", () => {
    const rollups = buildHorseRollups(
      [horse({ id: "a", name: "Apollo", target_session_count: 1 })],
      [
        session({ horse_id: "a", start_time: "2026-05-13T10:00:00Z", end_time: "2026-05-13T10:30:00Z" }),
        session({ horse_id: "a", start_time: "2026-05-12T10:00:00Z", end_time: "2026-05-12T10:30:00Z" }),
      ],
      now,
    );
    expect(rollups[0].session_pct).toBe(2);
  });

  it("flags active_last_7d based on most recent session", () => {
    const rollups = buildHorseRollups(
      [horse({ id: "a", name: "Apollo" }), horse({ id: "b", name: "Brego" })],
      [
        session({ horse_id: "a", start_time: "2026-05-13T10:00:00Z", end_time: "2026-05-13T10:30:00Z" }),
        session({ horse_id: "b", start_time: "2026-04-01T10:00:00Z", end_time: "2026-04-01T10:30:00Z" }),
      ],
      now,
    );
    expect(rollups.find((r) => r.id === "a")!.active_last_7d).toBe(true);
    expect(rollups.find((r) => r.id === "b")!.active_last_7d).toBe(false);
  });
});

describe("buildHorseKpis", () => {
  it("returns null progress fields when no horse has objectives", () => {
    const rollups = buildHorseRollups(
      [{ id: "a", name: "Apollo", target_session_count: null, target_ride_minutes: null, admin_notes: null }],
      [],
    );
    const kpis = buildHorseKpis(rollups);
    expect(kpis.horse_count).toBe(1);
    expect(kpis.horses_with_objectives).toBe(0);
    expect(kpis.session_progress).toBeNull();
    expect(kpis.minutes_progress).toBeNull();
  });

  it("aggregates session progress across horses with targets, capping per-horse", () => {
    const rollups = buildHorseRollups(
      [
        { id: "a", name: "A", target_session_count: 10, target_ride_minutes: null, admin_notes: null },
        { id: "b", name: "B", target_session_count: 10, target_ride_minutes: null, admin_notes: null },
      ],
      [
        // a has 20 sessions; capped at 10. b has 5.
        ...Array.from({ length: 20 }, (_, i) => ({
          horse_id: "a",
          start_time: `2026-05-${String(((i % 28) + 1)).padStart(2, "0")}T10:00:00Z`,
          end_time: null,
        })),
        ...Array.from({ length: 5 }, (_, i) => ({
          horse_id: "b",
          start_time: `2026-05-${String((i + 1)).padStart(2, "0")}T10:00:00Z`,
          end_time: null,
        })),
      ],
    );
    const kpis = buildHorseKpis(rollups);
    expect(kpis.horses_with_objectives).toBe(2);
    // (min(20,10) + min(5,10)) / (10 + 10) = 15/20 = 0.75
    expect(kpis.session_progress).toBeCloseTo(0.75);
  });
});

describe("sortHorseRollupsByActivity", () => {
  const now = new Date("2026-05-14T12:00:00.000Z");

  it("puts horses with sessions before horses without, then by most recent", () => {
    const rollups = buildHorseRollups(
      [
        horse({ id: "never", name: "Zelda" }),
        horse({ id: "old", name: "Apollo" }),
        horse({ id: "recent", name: "Brego" }),
      ],
      [
        session({ horse_id: "old", start_time: "2026-04-01T10:00:00Z", end_time: "2026-04-01T10:30:00Z" }),
        session({ horse_id: "recent", start_time: "2026-05-13T10:00:00Z", end_time: "2026-05-13T10:30:00Z" }),
      ],
      now,
    );
    const sorted = sortHorseRollupsByActivity(rollups);
    expect(sorted.map((r) => r.id)).toEqual(["recent", "old", "never"]);
  });
});
