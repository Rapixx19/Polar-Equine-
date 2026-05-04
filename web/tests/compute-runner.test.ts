import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  process.env.ADMIN_EMAILS = "ferdinand.straehuber@gmail.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.CRON_SECRET = "test-cron-secret";
  process.env.ALGO_BASE_URL = "https://algo.test";
  process.env.ALGO_BEARER_TOKEN = "test-algo-token";
});

type JobRow = {
  id: string;
  session_id: string;
  job_type: string;
  status: string;
  attempts: number;
  next_run_at: string;
  last_error: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type State = {
  queuedRow: JobRow | null;
  claimWins: boolean;
  computeJobsUpdates: Array<Record<string, unknown>>;
  sessionsUpdates: Array<Record<string, unknown>>;
};

const state: State = {
  queuedRow: null,
  claimWins: true,
  computeJobsUpdates: [],
  sessionsUpdates: [],
};

// The runner's two .update() shapes:
//   claim:   .update(p).eq().eq().select("*").maybeSingle()  — needs filtered chain
//   outcome: .update(p).eq()                                  — awaited as a thenable
// We resolve both by returning an object that exposes both .eq() (claim chain
// continuation) and .then() (terminal await).
function buildClient() {
  return {
    from: (tableName: string) => ({
      select: () => ({
        eq: () => ({
          lte: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: tableName === "compute_jobs" ? state.queuedRow : null,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        if (tableName === "sessions") {
          state.sessionsUpdates.push(patch);
          return {
            eq: () => Promise.resolve({ data: null, error: null }),
          };
        }
        // compute_jobs: record on update so both shapes count, then return a
        // hybrid object that supports the claim chain or a direct await.
        state.computeJobsUpdates.push(patch);
        const claimResult = {
          select: () => ({
            maybeSingle: async () => {
              if (!state.claimWins) return { data: null, error: null };
              return {
                data: state.queuedRow ? { ...state.queuedRow, ...patch } : null,
                error: null,
              };
            },
          }),
        };
        const terminalResult = Promise.resolve({ data: null, error: null });
        return {
          // First .eq() — both shapes call this.
          eq: () => ({
            // Second .eq() for the claim path.
            eq: () => claimResult,
            // Terminal-await path — outcome paths chain only one .eq().
            then: (
              onFulfilled?: (v: unknown) => unknown,
              onRejected?: (e: unknown) => unknown,
            ) => terminalResult.then(onFulfilled, onRejected),
          }),
        };
      },
    }),
  };
}

vi.mock("@/lib/auth/service-role", () => ({
  createServiceRoleClient: () => buildClient(),
}));

const fetchSpy = vi.fn();
vi.stubGlobal("fetch", fetchSpy);

afterEach(() => {
  vi.clearAllMocks();
  state.queuedRow = null;
  state.claimWins = true;
  state.computeJobsUpdates = [];
  state.sessionsUpdates = [];
});

function fakeReq(headers: Record<string, string>): NextRequest {
  return {
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  } as unknown as NextRequest;
}

function makeJob(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: "job-1",
    session_id: "11111111-1111-4111-8111-111111111111",
    job_type: "compute",
    status: "queued",
    attempts: 0,
    next_run_at: new Date(Date.now() - 1000).toISOString(),
    last_error: null,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

function fetchResponse(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("GET /api/cron/compute-runner", () => {
  it("returns 401 when authorization header is missing", async () => {
    const { GET } = await import("@/app/api/cron/compute-runner/route");
    const res = await GET(fakeReq({}));
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns picked=0 when nothing is queued", async () => {
    state.queuedRow = null;
    const { GET } = await import("@/app/api/cron/compute-runner/route");
    const res = await GET(fakeReq({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { picked: number };
    expect(json.picked).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("happy path: algo returns 200 → job marked succeeded", async () => {
    state.queuedRow = makeJob();
    fetchSpy.mockResolvedValueOnce(fetchResponse(200, { status: "complete" }));
    const { GET } = await import("@/app/api/cron/compute-runner/route");
    const res = await GET(fakeReq({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { picked: number; dispatched: number };
    expect(json.picked).toBe(1);
    expect(json.dispatched).toBe(1);
    expect(state.computeJobsUpdates.some((p) => p.status === "succeeded")).toBe(true);
    expect(state.sessionsUpdates).toHaveLength(0);
  });

  it("retry path: algo 500 with attempts=0 → job re-queued with next_run_at delay", async () => {
    state.queuedRow = makeJob({ attempts: 0 });
    fetchSpy.mockResolvedValueOnce(fetchResponse(500, { detail: "boom" }));
    const { GET } = await import("@/app/api/cron/compute-runner/route");
    await GET(fakeReq({ authorization: "Bearer test-cron-secret" }));
    const requeue = state.computeJobsUpdates.find(
      (p) => p.status === "queued" && p.next_run_at !== undefined,
    );
    expect(requeue).toBeDefined();
    expect(state.sessionsUpdates).toHaveLength(0);
  });

  it("failed path: algo 500 with attempts=1 → job=failed AND sessions.metrics_status=failed", async () => {
    state.queuedRow = makeJob({ attempts: 1 });
    fetchSpy.mockResolvedValueOnce(fetchResponse(500, { detail: "boom" }));
    const { GET } = await import("@/app/api/cron/compute-runner/route");
    await GET(fakeReq({ authorization: "Bearer test-cron-secret" }));
    expect(state.computeJobsUpdates.some((p) => p.status === "failed")).toBe(true);
    expect(state.sessionsUpdates).toHaveLength(1);
    expect(state.sessionsUpdates[0].metrics_status).toBe("failed");
  });

  it("race-loss: claim UPDATE returns 0 rows → picked=0, no fetch", async () => {
    state.queuedRow = makeJob();
    state.claimWins = false;
    const { GET } = await import("@/app/api/cron/compute-runner/route");
    const res = await GET(fakeReq({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { picked: number };
    expect(json.picked).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("409 terminal-success: job=succeeded AND sessions.metrics_status untouched", async () => {
    state.queuedRow = makeJob();
    fetchSpy.mockResolvedValueOnce(
      fetchResponse(409, { detail: "already_computed_or_in_progress" }),
    );
    const { GET } = await import("@/app/api/cron/compute-runner/route");
    const res = await GET(fakeReq({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(200);
    const succeeded = state.computeJobsUpdates.find((p) => p.status === "succeeded");
    expect(succeeded).toBeDefined();
    expect(succeeded!.last_error).toBe("algo_409_terminal_success");
    expect(state.sessionsUpdates).toHaveLength(0); // critical
  });
});
