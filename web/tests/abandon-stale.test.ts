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

const updateSpy = vi.fn<(...args: unknown[]) => void>();

type UpdateReturn = { data: Array<{ id: string }> | null; error: { code?: string; message?: string } | null };

let updateReturn: UpdateReturn = { data: [], error: null };

function buildClient() {
  return {
    from: vi.fn(() => ({
      update: (patch: unknown) => {
        updateSpy(patch);
        return {
          eq: () => ({
            lt: () => ({
              select: async () => updateReturn,
            }),
          }),
        };
      },
    })),
  };
}

vi.mock("@/lib/auth/service-role", () => ({
  createServiceRoleClient: () => buildClient(),
}));

afterEach(() => {
  vi.clearAllMocks();
  updateReturn = { data: [], error: null };
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
    updateReturn = { data: [], error: null };
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
    updateReturn = {
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
    updateReturn = { data: null, error: { code: "42501", message: "rls" } };
    const { GET } = await import("@/app/api/cron/abandon-stale/route");
    const res = await GET(fakeReq({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(500);
  });
});
