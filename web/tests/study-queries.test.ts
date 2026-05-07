import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
});

type CallRecord = {
  table: string;
  method: string;
  args: unknown[];
};

type TableResponse = {
  data?: unknown;
  count?: number | null;
  error?: unknown;
};

let calls: CallRecord[];
let responses: Record<string, TableResponse>;

function makeBuilder(table: string) {
  const getResponse = (): TableResponse => responses[table] ?? { data: null, error: null };
  const builder: Record<string, unknown> = {};
  const chainable = (method: string) => (...args: unknown[]) => {
    calls.push({ table, method, args });
    return builder;
  };
  builder.select = chainable("select");
  builder.eq = chainable("eq");
  builder.in = chainable("in");
  builder.order = chainable("order");
  builder.range = chainable("range");
  builder.limit = chainable("limit");
  builder.gte = chainable("gte");
  builder.lte = chainable("lte");
  builder.not = chainable("not");
  builder.maybeSingle = async () => {
    calls.push({ table, method: "maybeSingle", args: [] });
    return getResponse();
  };
  builder.single = async () => {
    calls.push({ table, method: "single", args: [] });
    return getResponse();
  };
  builder.then = (onResolve: (v: TableResponse) => unknown, onReject?: (e: unknown) => unknown) => {
    calls.push({ table, method: "await", args: [] });
    return Promise.resolve(getResponse()).then(onResolve, onReject);
  };
  return builder;
}

function buildClient() {
  return {
    from: vi.fn((table: string) => makeBuilder(table)),
  };
}

afterEach(() => {
  calls = [];
  responses = {};
});

beforeAll(() => {
  calls = [];
  responses = {};
});

const RIDER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RIDER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const HORSE_A = "11111111-1111-4111-8111-111111111111";
const HORSE_B = "22222222-2222-4222-8222-222222222222";

describe("getStudySettings", () => {
  it("returns the single-row settings", async () => {
    responses["study_settings"] = {
      data: {
        weekly_target_per_rider: 4,
        v0_phase_weeks: 16,
        realistic_completion: 0.8,
        realistic_qc_pass: 0.85,
        storage_mb_per_session: 85,
        storage_quota_mb: 8192,
        storage_migration_trigger_pct: 50,
        advisory_sessions_per_horse_per_week: 4,
        advisory_jumping_per_horse_per_week: 2,
        advisory_gallop_per_horse_per_week: 2,
        advisory_min_hours_between: 12,
      },
      error: null,
    };
    const { getStudySettings } = await import("@/lib/admin/study-queries");
    const supabase = buildClient();

    const s = await getStudySettings(supabase as never);
    expect(s.weekly_target_per_rider).toBe(4);
    expect(s.v0_phase_weeks).toBe(16);
    expect(s.realistic_completion).toBe(0.8);

    const eqId = calls.find(
      (c) => c.table === "study_settings" && c.method === "eq" && c.args[0] === "id",
    );
    expect(eqId).toBeDefined();
    expect(eqId!.args[1]).toBe(1);
  });

  it("throws when settings row is missing (migration not applied)", async () => {
    responses["study_settings"] = { data: null, error: null };
    const { getStudySettings } = await import("@/lib/admin/study-queries");
    const supabase = buildClient();

    await expect(getStudySettings(supabase as never)).rejects.toThrow(/migration 019/);
  });
});

describe("getAllocationTargets", () => {
  it("returns rows ordered by sort_order", async () => {
    const rows = [
      { type: "A-Walk", sort_order: 1, pct: 8, label: "Pure walk", color: "#7FB069", emphasis: "foundation" },
      { type: "A-Trot", sort_order: 2, pct: 16, label: "Pure trot", color: "#7FB069", emphasis: "foundation" },
      { type: "A-Canter", sort_order: 3, pct: 16, label: "Pure canter", color: "#7FB069", emphasis: "foundation" },
      { type: "A-Gallop", sort_order: 4, pct: 6, label: "Pure gallop", color: "#C45D52", emphasis: "state-rich" },
      { type: "A-Rest", sort_order: 5, pct: 4, label: "Standing rest", color: "#7FB069", emphasis: "foundation" },
      { type: "B-Transitions", sort_order: 6, pct: 12, label: "Transitions drill", color: "#E0A458", emphasis: "specialized" },
      { type: "C-Mixed", sort_order: 7, pct: 24, label: "Mixed real-world", color: "#5B9AA0", emphasis: "core" },
      { type: "D-Jumping", sort_order: 8, pct: 10, label: "Jumping", color: "#9B6B9E", emphasis: "specialized" },
      { type: "E-Context", sort_order: 9, pct: 4, label: "Context-varied", color: "#5B9AA0", emphasis: "specialized" },
    ];
    responses["study_allocation_targets"] = { data: rows, error: null };

    const { getAllocationTargets } = await import("@/lib/admin/study-queries");
    const supabase = buildClient();

    const r = await getAllocationTargets(supabase as never);
    expect(r).toHaveLength(9);
    const totalPct = r.reduce((acc, t) => acc + t.pct, 0);
    expect(totalPct).toBe(100);

    const orderCall = calls.find(
      (c) => c.table === "study_allocation_targets" && c.method === "order",
    );
    expect(orderCall).toBeDefined();
    expect(orderCall!.args[0]).toBe("sort_order");
  });

  it("returns [] when table is empty", async () => {
    responses["study_allocation_targets"] = { data: [], error: null };
    const { getAllocationTargets } = await import("@/lib/admin/study-queries");
    const supabase = buildClient();

    const r = await getAllocationTargets(supabase as never);
    expect(r).toEqual([]);
  });
});

describe("listStudyRiders", () => {
  it("computes sessions_completed, last_session, qc_pass_rate, flags_raised per rider", async () => {
    responses["rider_profiles"] = {
      data: [
        {
          id: RIDER_A,
          display_name: "Ferdinand",
          yard: "La Fattoria",
          joined_week: 1,
          primary_discipline: "eventing",
          weekly_target_override: null,
          is_active: true,
        },
      ],
      error: null,
    };
    responses["sessions"] = {
      data: [
        { id: "s1", rider_id: RIDER_A, start_time: "2026-05-01T10:00:00Z", status: "completed", metrics_status: "complete" },
        { id: "s2", rider_id: RIDER_A, start_time: "2026-05-05T10:00:00Z", status: "completed", metrics_status: "complete" },
        { id: "s3", rider_id: RIDER_A, start_time: "2026-05-06T10:00:00Z", status: "completed", metrics_status: "failed" },
        { id: "s4", rider_id: RIDER_A, start_time: "2026-05-07T10:00:00Z", status: "ongoing", metrics_status: null },
      ],
      error: null,
    };
    responses["compute_jobs"] = {
      data: [
        { session_id: "s3", status: "failed", sessions: { rider_id: RIDER_A } },
      ],
      error: null,
    };

    const { listStudyRiders } = await import("@/lib/admin/study-queries");
    const supabase = buildClient();

    const r = await listStudyRiders(supabase as never);
    expect(r).toHaveLength(1);
    expect(r[0].sessions_completed).toBe(3);
    expect(r[0].last_session).toBe("2026-05-07T10:00:00Z");
    expect(r[0].qc_pass_rate).toBeCloseTo(2 / 3, 5);
    expect(r[0].flags_raised).toBe(1);
  });

  it("defaults to filtering is_active=true (only active riders)", async () => {
    responses["rider_profiles"] = { data: [], error: null };
    responses["sessions"] = { data: [], error: null };
    responses["compute_jobs"] = { data: [], error: null };

    const { listStudyRiders } = await import("@/lib/admin/study-queries");
    const supabase = buildClient();

    await listStudyRiders(supabase as never);
    const eqActive = calls.find(
      (c) =>
        c.table === "rider_profiles" &&
        c.method === "eq" &&
        c.args[0] === "is_active",
    );
    expect(eqActive).toBeDefined();
    expect(eqActive!.args[1]).toBe(true);
  });

  it("includes inactive riders when includeInactive=true", async () => {
    responses["rider_profiles"] = { data: [], error: null };
    responses["sessions"] = { data: [], error: null };
    responses["compute_jobs"] = { data: [], error: null };

    const { listStudyRiders } = await import("@/lib/admin/study-queries");
    const supabase = buildClient();

    await listStudyRiders(supabase as never, { includeInactive: true });
    const eqActive = calls.find(
      (c) =>
        c.table === "rider_profiles" &&
        c.method === "eq" &&
        c.args[0] === "is_active",
    );
    expect(eqActive).toBeUndefined();
  });

  it("returns [] short-circuit when rider_profiles is empty", async () => {
    responses["rider_profiles"] = { data: [], error: null };

    const { listStudyRiders } = await import("@/lib/admin/study-queries");
    const supabase = buildClient();

    const r = await listStudyRiders(supabase as never);
    expect(r).toEqual([]);
    const sessionsHit = calls.find((c) => c.table === "sessions");
    expect(sessionsHit).toBeUndefined();
  });

  it("qc_pass_rate is null when no metrics yet", async () => {
    responses["rider_profiles"] = {
      data: [
        {
          id: RIDER_B,
          display_name: "Sister",
          yard: null,
          joined_week: null,
          primary_discipline: null,
          weekly_target_override: null,
          is_active: true,
        },
      ],
      error: null,
    };
    responses["sessions"] = {
      data: [
        { id: "x1", rider_id: RIDER_B, start_time: "2026-05-01T10:00:00Z", status: "completed", metrics_status: null },
      ],
      error: null,
    };
    responses["compute_jobs"] = { data: [], error: null };

    const { listStudyRiders } = await import("@/lib/admin/study-queries");
    const supabase = buildClient();

    const r = await listStudyRiders(supabase as never);
    expect(r[0].qc_pass_rate).toBeNull();
    expect(r[0].sessions_completed).toBe(1);
    expect(r[0].flags_raised).toBe(0);
  });
});

describe("listStudyHorses", () => {
  it("returns horses with computed age_years and sessions_completed", async () => {
    const tenYearsAgo = new Date(Date.now() - 10 * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    responses["horses"] = {
      data: [
        {
          id: HORSE_A,
          name: "Luna",
          date_of_birth: tenYearsAgo,
          sex: "mare",
          level: "high-performance",
          discipline: "eventing",
          is_holdout: false,
          advisory_weekly_cap_override: null,
        },
        {
          id: HORSE_B,
          name: "Rocky",
          date_of_birth: null,
          sex: "gelding",
          level: null,
          discipline: null,
          is_holdout: true,
          advisory_weekly_cap_override: 6,
        },
      ],
      error: null,
    };
    responses["sessions"] = {
      data: [
        { horse_id: HORSE_A },
        { horse_id: HORSE_A },
        { horse_id: HORSE_A },
        { horse_id: HORSE_B },
      ],
      error: null,
    };

    const { listStudyHorses } = await import("@/lib/admin/study-queries");
    const supabase = buildClient();

    const r = await listStudyHorses(supabase as never);
    expect(r).toHaveLength(2);
    const luna = r.find((h) => h.name === "Luna")!;
    const rocky = r.find((h) => h.name === "Rocky")!;
    expect(luna.age_years).toBeGreaterThanOrEqual(9);
    expect(luna.age_years).toBeLessThanOrEqual(10);
    expect(luna.sessions_completed).toBe(3);
    expect(luna.is_holdout).toBe(false);
    expect(rocky.age_years).toBeNull();
    expect(rocky.sessions_completed).toBe(1);
    expect(rocky.is_holdout).toBe(true);
    expect(rocky.advisory_weekly_cap_override).toBe(6);
  });

  it("returns [] short-circuit when horses table is empty", async () => {
    responses["horses"] = { data: [], error: null };

    const { listStudyHorses } = await import("@/lib/admin/study-queries");
    const supabase = buildClient();

    const r = await listStudyHorses(supabase as never);
    expect(r).toEqual([]);
    const sessionsHit = calls.find((c) => c.table === "sessions");
    expect(sessionsHit).toBeUndefined();
  });
});

describe("listSessionsByResearchLabel", () => {
  it("tallies completed sessions by mapped research label", async () => {
    responses["sessions"] = {
      data: [
        { activity_type: "walker", riding_subtype: null },
        { activity_type: "walker", riding_subtype: null },
        { activity_type: "riding", riding_subtype: "flat_work" },
        { activity_type: "riding", riding_subtype: "light_jumping" },
        { activity_type: "riding", riding_subtype: "heavy_jumping" },
        { activity_type: "stall", riding_subtype: null },
        { activity_type: "lunging", riding_subtype: null },
        { activity_type: "other", riding_subtype: null },
        { activity_type: "other", riding_subtype: null },
      ],
      error: null,
    };

    const { listSessionsByResearchLabel } = await import("@/lib/admin/study-queries");
    const supabase = buildClient();

    const r = await listSessionsByResearchLabel(supabase as never);
    const byLabel = Object.fromEntries(r.map((t) => [t.label, t.count]));
    expect(byLabel["A-Walk"]).toBe(2);
    expect(byLabel["C-Mixed"]).toBe(1);
    expect(byLabel["D-Jumping"]).toBe(2);
    expect(byLabel["A-Rest"]).toBe(1);
    expect(byLabel["E-Context"]).toBe(1);
    expect(byLabel["Unmapped"]).toBe(2);

    const eqStatus = calls.find(
      (c) => c.table === "sessions" && c.method === "eq" && c.args[0] === "status",
    );
    expect(eqStatus).toBeDefined();
    expect(eqStatus!.args[1]).toBe("completed");
  });

  it("returns [] when no completed sessions", async () => {
    responses["sessions"] = { data: [], error: null };
    const { listSessionsByResearchLabel } = await import("@/lib/admin/study-queries");
    const supabase = buildClient();

    const r = await listSessionsByResearchLabel(supabase as never);
    expect(r).toEqual([]);
  });
});
