import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
});

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const RIDER_ID = "44444444-4444-4444-8444-444444444444";

const getUserMock = vi.fn();
const insertMock = vi.fn();

function buildClient() {
  return {
    auth: {},
    from: vi.fn(() => ({
      insert: insertMock,
    })),
  };
}

vi.mock("@/lib/auth/server", () => ({
  createServerSupabaseClient: async () => buildClient(),
  getUser: getUserMock,
}));

function makeReq(body: unknown): NextRequest {
  return new Request("https://app.test/api/sessions/x/signal-events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

async function callPOST(id: string, body: unknown) {
  const mod = await import("@/app/api/sessions/[id]/signal-events/route");
  return mod.POST(makeReq(body), { params: Promise.resolve({ id }) });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/sessions/[id]/signal-events", () => {
  it("rejects malformed id with 400", async () => {
    getUserMock.mockResolvedValue({ id: RIDER_ID });
    const res = await callPOST("not-a-uuid", {
      events: [{ kind: "weak", t_start_ms: 0, t_end_ms: 1000 }],
    });
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue(null);
    const res = await callPOST(SESSION_ID, {
      events: [{ kind: "weak", t_start_ms: 0, t_end_ms: 1000 }],
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid request body", async () => {
    getUserMock.mockResolvedValue({ id: RIDER_ID });
    const res = await callPOST(SESSION_ID, { wrong_shape: true });
    expect(res.status).toBe(400);
  });

  it("returns 400 when an event has t_end < t_start", async () => {
    getUserMock.mockResolvedValue({ id: RIDER_ID });
    const res = await callPOST(SESSION_ID, {
      events: [{ kind: "weak", t_start_ms: 2000, t_end_ms: 1000 }],
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_event_range" });
  });

  it("inserts events and returns the count", async () => {
    getUserMock.mockResolvedValue({ id: RIDER_ID });
    insertMock.mockResolvedValue({ error: null });
    const res = await callPOST(SESSION_ID, {
      events: [
        { kind: "weak", t_start_ms: 0, t_end_ms: 1000 },
        { kind: "lost", t_start_ms: 2000, t_end_ms: 3500 },
      ],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ inserted: 2 });
    expect(insertMock).toHaveBeenCalledOnce();
    const args = insertMock.mock.calls[0][0] as Array<{
      session_id: string;
      kind: string;
      t_start_ms: number;
      t_end_ms: number;
    }>;
    expect(args).toHaveLength(2);
    expect(args[0].session_id).toBe(SESSION_ID);
    expect(args[0].kind).toBe("weak");
  });

  it("maps RLS denial (42501) to 403", async () => {
    getUserMock.mockResolvedValue({ id: RIDER_ID });
    insertMock.mockResolvedValue({ error: { code: "42501", message: "rls" } });
    const res = await callPOST(SESSION_ID, {
      events: [{ kind: "weak", t_start_ms: 0, t_end_ms: 1000 }],
    });
    expect(res.status).toBe(403);
  });

  it("rejects more than 50 events at once", async () => {
    getUserMock.mockResolvedValue({ id: RIDER_ID });
    const events = Array.from({ length: 51 }, (_, i) => ({
      kind: "weak" as const,
      t_start_ms: i * 1000,
      t_end_ms: i * 1000 + 500,
    }));
    const res = await callPOST(SESSION_ID, { events });
    expect(res.status).toBe(400);
  });
});
