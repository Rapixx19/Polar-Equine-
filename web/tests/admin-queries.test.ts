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

const HORSE_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const RIDER_ID = "44444444-4444-4444-8444-444444444444";

beforeAll(() => {
  calls = [];
  responses = {};
});

describe("listAllSessions", () => {
  it("returns rows with horse + rider joined", async () => {
    responses["sessions"] = {
      data: [
        {
          id: SESSION_ID,
          start_time: "2026-05-06T10:00:00.000Z",
          activity_type: "riding",
          status: "completed",
          horse: { name: "Luna" },
          rider: { display_name: "Ferdinand" },
        },
      ],
      count: 1,
      error: null,
    };
    const { listAllSessions } = await import("@/lib/admin/queries");
    const supabase = buildClient();

    const result = await listAllSessions(supabase as never, { page: 1 });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].horse?.name).toBe("Luna");
    expect(result.rows[0].rider?.display_name).toBe("Ferdinand");
    expect(result.total).toBe(1);

    const selectCall = calls.find((c) => c.table === "sessions" && c.method === "select");
    expect(selectCall).toBeDefined();
    const selectArgs = selectCall!.args[0] as string;
    expect(selectArgs).toContain("horses");
    expect(selectArgs).toContain("rider_profiles");
  });

  it("paginates correctly: page 2 → range(50, 99)", async () => {
    responses["sessions"] = { data: [], count: 200, error: null };
    const { listAllSessions } = await import("@/lib/admin/queries");
    const supabase = buildClient();

    await listAllSessions(supabase as never, { page: 2 });
    const rangeCall = calls.find((c) => c.table === "sessions" && c.method === "range");
    expect(rangeCall).toBeDefined();
    expect(rangeCall!.args).toEqual([50, 99]);
  });

  it("applies status filter via .eq('status', ...)", async () => {
    responses["sessions"] = { data: [], count: 0, error: null };
    const { listAllSessions } = await import("@/lib/admin/queries");
    const supabase = buildClient();

    await listAllSessions(supabase as never, { page: 1, status: "completed" });
    const eqStatus = calls.find(
      (c) =>
        c.table === "sessions" &&
        c.method === "eq" &&
        (c.args[0] as string) === "status",
    );
    expect(eqStatus).toBeDefined();
    expect(eqStatus!.args[1]).toBe("completed");
  });

  it("does NOT apply status filter when status='all'", async () => {
    responses["sessions"] = { data: [], count: 0, error: null };
    const { listAllSessions } = await import("@/lib/admin/queries");
    const supabase = buildClient();

    await listAllSessions(supabase as never, { page: 1, status: "all" });
    const eqStatus = calls.find(
      (c) =>
        c.table === "sessions" &&
        c.method === "eq" &&
        (c.args[0] as string) === "status",
    );
    expect(eqStatus).toBeUndefined();
  });
});

describe("getSessionDetail", () => {
  it("returns null when session not found", async () => {
    responses["sessions"] = { data: null, error: null };
    responses["session_metrics"] = { data: null, error: null };
    responses["compute_jobs"] = { data: [], error: null };
    responses["samples_hr"] = { data: [], count: 0, error: null };

    const { getSessionDetail } = await import("@/lib/admin/queries");
    const supabase = buildClient();

    const result = await getSessionDetail(supabase as never, SESSION_ID);
    expect(result).toBeNull();
  });

  it("queries all 4 tables (sessions, session_metrics, compute_jobs, samples_hr)", async () => {
    responses["sessions"] = {
      data: {
        id: SESSION_ID,
        horse_id: HORSE_ID,
        rider_id: RIDER_ID,
        activity_type: "riding",
        riding_subtype: "heavy_jumping",
        activity_note: null,
        start_time: "2026-05-06T10:00:00.000Z",
        end_time: "2026-05-06T11:00:00.000Z",
        status: "completed",
        metrics_status: "complete",
        notes: null,
        horse: { id: HORSE_ID, name: "Luna" },
        rider: { id: RIDER_ID, display_name: "Ferdinand" },
      },
      error: null,
    };
    responses["session_metrics"] = { data: { session_id: SESSION_ID, hr_avg: 110 }, error: null };
    responses["compute_jobs"] = { data: [{ id: "j1", status: "succeeded" }], error: null };
    responses["samples_hr"] = { data: [{ id: 1, hr_bpm: 110, timestamp_ms: 0, rr_ms: 540, contact: true }], count: 1, error: null };

    const { getSessionDetail } = await import("@/lib/admin/queries");
    const supabase = buildClient();

    const result = await getSessionDetail(supabase as never, SESSION_ID);
    expect(result).not.toBeNull();
    expect(result!.session.id).toBe(SESSION_ID);
    expect(result!.metrics?.hr_avg).toBe(110);
    expect(result!.jobs).toHaveLength(1);
    expect(result!.samplesPreview).toHaveLength(1);
    expect(result!.samplesForChart).toHaveLength(1);
    expect(result!.sampleCount).toBe(1);

    const tablesUsed = new Set(calls.map((c) => c.table));
    expect(tablesUsed.has("sessions")).toBe(true);
    expect(tablesUsed.has("session_metrics")).toBe(true);
    expect(tablesUsed.has("compute_jobs")).toBe(true);
    expect(tablesUsed.has("samples_hr")).toBe(true);

    const sampleRangeCalls = calls.filter(
      (c) => c.table === "samples_hr" && c.method === "range",
    );
    const ranges = sampleRangeCalls.map((c) => c.args);
    expect(ranges).toContainEqual([0, 99]);
    expect(ranges).toContainEqual([0, 4999]);
  });

  it("caps samples preview at 100 rows via .range(0, 99)", async () => {
    responses["sessions"] = {
      data: {
        id: SESSION_ID,
        horse_id: HORSE_ID,
        rider_id: RIDER_ID,
        activity_type: "riding",
        riding_subtype: null,
        activity_note: null,
        start_time: "2026-05-06T10:00:00.000Z",
        end_time: null,
        status: "completed",
        metrics_status: null,
        notes: null,
        horse: { id: HORSE_ID, name: "Luna" },
        rider: { id: RIDER_ID, display_name: "F" },
      },
      error: null,
    };
    responses["session_metrics"] = { data: null, error: null };
    responses["compute_jobs"] = { data: [], error: null };
    responses["samples_hr"] = { data: [], count: 7500, error: null };

    const { getSessionDetail } = await import("@/lib/admin/queries");
    const supabase = buildClient();

    await getSessionDetail(supabase as never, SESSION_ID);
    const sampleRangeCalls = calls.filter(
      (c) => c.table === "samples_hr" && c.method === "range",
    );
    expect(sampleRangeCalls.length).toBeGreaterThanOrEqual(1);
    expect(sampleRangeCalls[0].args).toEqual([0, 99]);
  });
});

describe("listSessionsForHorse", () => {
  it("filters by horse_id", async () => {
    responses["sessions"] = { data: [], count: 0, error: null };
    const { listSessionsForHorse } = await import("@/lib/admin/queries");
    const supabase = buildClient();

    await listSessionsForHorse(supabase as never, HORSE_ID, { page: 1 });
    const eqHorse = calls.find(
      (c) =>
        c.table === "sessions" &&
        c.method === "eq" &&
        (c.args[0] as string) === "horse_id",
    );
    expect(eqHorse).toBeDefined();
    expect(eqHorse!.args[1]).toBe(HORSE_ID);
  });
});

describe("listComputeJobs", () => {
  it("default-filters to status='failed'", async () => {
    responses["compute_jobs"] = { data: [], count: 0, error: null };
    const { listComputeJobs } = await import("@/lib/admin/queries");
    const supabase = buildClient();

    await listComputeJobs(supabase as never, { page: 1 });
    const eqStatus = calls.find(
      (c) =>
        c.table === "compute_jobs" &&
        c.method === "eq" &&
        (c.args[0] as string) === "status",
    );
    expect(eqStatus).toBeDefined();
    expect(eqStatus!.args[1]).toBe("failed");
  });

  it("does NOT filter when status='all'", async () => {
    responses["compute_jobs"] = { data: [], count: 0, error: null };
    const { listComputeJobs } = await import("@/lib/admin/queries");
    const supabase = buildClient();

    await listComputeJobs(supabase as never, { page: 1, status: "all" });
    const eqStatus = calls.find(
      (c) =>
        c.table === "compute_jobs" &&
        c.method === "eq" &&
        (c.args[0] as string) === "status",
    );
    expect(eqStatus).toBeUndefined();
  });
});

describe("listAllHorses", () => {
  it("returns rows from horses table", async () => {
    responses["horses"] = {
      data: [{ id: HORSE_ID, name: "Luna" }],
      error: null,
    };
    const { listAllHorses } = await import("@/lib/admin/queries");
    const supabase = buildClient();

    const result = await listAllHorses(supabase as never);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe("Luna");
  });
});
