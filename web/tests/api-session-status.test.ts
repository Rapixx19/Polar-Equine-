import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
});

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const RIDER_ID = "44444444-4444-4444-8444-444444444444";

type SessionRow = {
  status: "active" | "completed" | "abandoned" | "approved";
  metrics_status: "pending" | "computing" | "complete" | "failed";
  activity_type: string;
} | null;

const getUserMock = vi.fn();
let sessionRow: SessionRow = null;

function buildClient() {
  return {
    auth: {},
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: sessionRow, error: null }),
        }),
      }),
    })),
  };
}

vi.mock("@/lib/auth/server", () => ({
  createServerSupabaseClient: async () => buildClient(),
  getUser: getUserMock,
}));

function makeReq(): NextRequest {
  return new Request("https://app.test/api/sessions/x/status") as unknown as NextRequest;
}

async function callGET(id: string) {
  const mod = await import("@/app/api/sessions/[id]/status/route");
  return mod.GET(makeReq(), { params: Promise.resolve({ id }) });
}

afterEach(() => {
  vi.clearAllMocks();
  sessionRow = null;
});

describe("GET /api/sessions/[id]/status", () => {
  it("rejects malformed id with 400", async () => {
    getUserMock.mockResolvedValue({ id: RIDER_ID });
    const res = await callGET("not-a-uuid");
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue(null);
    const res = await callGET(SESSION_ID);
    expect(res.status).toBe(401);
  });

  it("returns 404 when row missing (RLS or not found)", async () => {
    getUserMock.mockResolvedValue({ id: RIDER_ID });
    sessionRow = null;
    const res = await callGET(SESSION_ID);
    expect(res.status).toBe(404);
  });

  it("returns status + metrics_status + activity_type on success", async () => {
    getUserMock.mockResolvedValue({ id: RIDER_ID });
    sessionRow = {
      status: "completed",
      metrics_status: "computing",
      activity_type: "riding",
    };
    const res = await callGET(SESSION_ID);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "completed",
      metrics_status: "computing",
      activity_type: "riding",
    });
  });

  it("returns terminal values once compute is complete", async () => {
    getUserMock.mockResolvedValue({ id: RIDER_ID });
    sessionRow = {
      status: "completed",
      metrics_status: "complete",
      activity_type: "riding",
    };
    const res = await callGET(SESSION_ID);
    const body = await res.json();
    expect(body.metrics_status).toBe("complete");
    expect(body.activity_type).toBe("riding");
  });
});
