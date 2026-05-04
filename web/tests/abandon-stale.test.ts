import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  process.env.ADMIN_EMAILS = "ferdinand.straehuber@gmail.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.CRON_SECRET = "test-cron-secret";
});

const sessionsUpdateSpy = vi.fn<(...args: unknown[]) => void>();
const jobsUpdateSpy = vi.fn<(...args: unknown[]) => void>();

type UpdateReturn = { data: Array<{ id: string }> | null; error: { code?: string; message?: string } | null };

let sessionsReturn: UpdateReturn = { data: [], error: null };
let jobsReturn: UpdateReturn = { data: [], error: null };

function buildClient() {
  return {
    from: (tableName: string) => ({
      update: (patch: unknown) => {
        const isSessions = tableName === "sessions";
        (isSessions ? sessionsUpdateSpy : jobsUpdateSpy)(patch);
        return {
          eq: () => ({
            lt: () => ({
              select: async () => (isSessions ? sessionsReturn : jobsReturn),
            }),
          }),
        };
      },
    }),
  };
}

vi.mock("@/lib/auth/service-role", () => ({
  createServiceRoleClient: () => buildClient(),
}));

// Backwards-compatible alias for older test cases that asserted on the single
// updateSpy. The legacy spy now points at the sessions update only.
const updateSpy = sessionsUpdateSpy;

afterEach(() => {
  vi.clearAllMocks();
  sessionsReturn = { data: [], error: null };
  jobsReturn = { data: [], error: null };
});

function fakeReq(headers: Record<string, string>): NextRequest {
  return {
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  } as unknown as NextRequest;
}

describe("GET /api/cron/abandon-stale", () => {
  it("returns 401 when authorization header is missing", async () => {
    const { GET } = await import("@/app/api/cron/abandon-stale/route");
    const res = await GET(fakeReq({}));
    expect(res.status).toBe(401);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("returns 401 when bearer token is wrong", async () => {
    const { GET } = await import("@/app/api/cron/abandon-stale/route");
    const res = await GET(fakeReq({ authorization: "Bearer wrong-secret" }));
    expect(res.status).toBe(401);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("returns 200 with abandoned=0 when nothing is stale", async () => {
    sessionsReturn = { data: [], error: null };
    const { GET } = await import("@/app/api/cron/abandon-stale/route");
    const res = await GET(fakeReq({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { abandoned: number };
    expect(json.abandoned).toBe(0);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const patch = updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.status).toBe("abandoned");
    expect(typeof patch.end_time).toBe("string");
  });

  it("returns 200 with abandoned=N when N rows match", async () => {
    sessionsReturn = {
      data: [
        { id: "11111111-1111-4111-8111-111111111111" },
        { id: "22222222-2222-4222-8222-222222222222" },
      ],
      error: null,
    };
    const { GET } = await import("@/app/api/cron/abandon-stale/route");
    const res = await GET(fakeReq({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { abandoned: number };
    expect(json.abandoned).toBe(2);
  });

  it("returns 500 on Supabase error", async () => {
    sessionsReturn = { data: null, error: { code: "42501", message: "rls" } };
    const { GET } = await import("@/app/api/cron/abandon-stale/route");
    const res = await GET(fakeReq({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(500);
  });

  it("resets stuck-running compute_jobs older than 5 min", async () => {
    sessionsReturn = { data: [], error: null };
    jobsReturn = {
      data: [{ id: "33333333-3333-4333-8333-333333333333" }],
      error: null,
    };
    const { GET } = await import("@/app/api/cron/abandon-stale/route");
    const res = await GET(fakeReq({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { abandoned: number; jobs_reset: number };
    expect(json.jobs_reset).toBe(1);
    expect(jobsUpdateSpy).toHaveBeenCalledTimes(1);
    const patch = jobsUpdateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.status).toBe("queued");
    expect(patch.last_error).toBe("stuck_running_reset");
    // attempts is intentionally NOT in the patch — the original retry budget
    // applies, so the reset must not re-increment.
    expect(patch.attempts).toBeUndefined();
  });
});
