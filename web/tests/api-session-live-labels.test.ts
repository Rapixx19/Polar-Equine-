import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
});

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

type InsertOutcome =
  | { data: { id: string; t_ms: number; label: string }; error: null }
  | { data: null; error: { code: string; message: string } };

type SelectOutcome =
  | { data: Array<Record<string, unknown>>; error: null }
  | { data: null; error: { code: string; message: string } };

const getUserMock = vi.fn();
const insertMock = vi.fn<(row: unknown) => Promise<InsertOutcome>>();
const selectMock = vi.fn<() => Promise<SelectOutcome>>();
let lastInsertedRow: Record<string, unknown> | null = null;

function buildClient() {
  return {
    from: (table: string) => {
      if (table !== "session_live_labels") throw new Error(`unexpected table ${table}`);
      return {
        insert: (row: Record<string, unknown>) => {
          lastInsertedRow = row;
          return {
            select: () => ({
              single: async () => insertMock(row),
            }),
          };
        },
        select: () => ({
          eq: () => ({
            order: async () => selectMock(),
          }),
        }),
      };
    },
  };
}

vi.mock("@/lib/auth/server", () => ({
  createServerSupabaseClient: async () => buildClient(),
  getUser: async () => getUserMock(),
}));

function fakeReq(body?: unknown): NextRequest {
  return {
    json: async () => body,
  } as unknown as NextRequest;
}

afterEach(() => {
  vi.clearAllMocks();
  getUserMock.mockReset();
  insertMock.mockReset();
  selectMock.mockReset();
  lastInsertedRow = null;
});

describe("POST /api/sessions/[id]/live-labels", () => {
  it("400 on invalid session id", async () => {
    getUserMock.mockResolvedValueOnce({ id: USER_ID });
    const { POST } = await import("@/app/api/sessions/[id]/live-labels/route");
    const res = await POST(fakeReq({ t_ms: 1000, label: "trot" }), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
  });

  it("401 when not authenticated", async () => {
    getUserMock.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/sessions/[id]/live-labels/route");
    const res = await POST(fakeReq({ t_ms: 1000, label: "trot" }), {
      params: Promise.resolve({ id: SESSION_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("400 on invalid label", async () => {
    getUserMock.mockResolvedValueOnce({ id: USER_ID });
    const { POST } = await import("@/app/api/sessions/[id]/live-labels/route");
    const res = await POST(fakeReq({ t_ms: 1000, label: "canter" }), {
      params: Promise.resolve({ id: SESSION_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("400 when jump is missing jump_count", async () => {
    getUserMock.mockResolvedValueOnce({ id: USER_ID });
    const { POST } = await import("@/app/api/sessions/[id]/live-labels/route");
    const res = await POST(fakeReq({ t_ms: 1000, label: "jump" }), {
      params: Promise.resolve({ id: SESSION_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("400 when non-jump label carries jump_count", async () => {
    getUserMock.mockResolvedValueOnce({ id: USER_ID });
    const { POST } = await import("@/app/api/sessions/[id]/live-labels/route");
    const res = await POST(fakeReq({ t_ms: 1000, label: "trot", jump_count: 2 }), {
      params: Promise.resolve({ id: SESSION_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("400 on negative t_ms", async () => {
    getUserMock.mockResolvedValueOnce({ id: USER_ID });
    const { POST } = await import("@/app/api/sessions/[id]/live-labels/route");
    const res = await POST(fakeReq({ t_ms: -1, label: "trot" }), {
      params: Promise.resolve({ id: SESSION_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("403 when RLS denies (session not active or not owned)", async () => {
    getUserMock.mockResolvedValueOnce({ id: USER_ID });
    insertMock.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "rls" } });
    const { POST } = await import("@/app/api/sessions/[id]/live-labels/route");
    const res = await POST(fakeReq({ t_ms: 5000, label: "trot" }), {
      params: Promise.resolve({ id: SESSION_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("201 success — gait row inserted with caller's rider_id, null jump_count", async () => {
    getUserMock.mockResolvedValueOnce({ id: USER_ID });
    insertMock.mockResolvedValueOnce({
      data: { id: "row-1", t_ms: 5000, label: "trot" },
      error: null,
    });
    const { POST } = await import("@/app/api/sessions/[id]/live-labels/route");
    const res = await POST(fakeReq({ t_ms: 5000, label: "trot" }), {
      params: Promise.resolve({ id: SESSION_ID }),
    });
    expect(res.status).toBe(201);
    expect(lastInsertedRow).toEqual({
      session_id: SESSION_ID,
      rider_id: USER_ID,
      t_ms: 5000,
      label: "trot",
      jump_count: null,
    });
    const body = (await res.json()) as { id: string; t_ms: number; label: string };
    expect(body.label).toBe("trot");
  });

  it("201 success — jump row carries jump_count", async () => {
    getUserMock.mockResolvedValueOnce({ id: USER_ID });
    insertMock.mockResolvedValueOnce({
      data: { id: "row-2", t_ms: 7000, label: "jump" },
      error: null,
    });
    const { POST } = await import("@/app/api/sessions/[id]/live-labels/route");
    const res = await POST(fakeReq({ t_ms: 7000, label: "jump", jump_count: 3 }), {
      params: Promise.resolve({ id: SESSION_ID }),
    });
    expect(res.status).toBe(201);
    expect(lastInsertedRow).toEqual({
      session_id: SESSION_ID,
      rider_id: USER_ID,
      t_ms: 7000,
      label: "jump",
      jump_count: 3,
    });
  });
});

describe("GET /api/sessions/[id]/live-labels", () => {
  it("401 when not authenticated", async () => {
    getUserMock.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/sessions/[id]/live-labels/route");
    const res = await GET(fakeReq(), { params: Promise.resolve({ id: SESSION_ID }) });
    expect(res.status).toBe(401);
  });

  it("200 returns labels ordered by t_ms", async () => {
    getUserMock.mockResolvedValueOnce({ id: USER_ID });
    selectMock.mockResolvedValueOnce({
      data: [
        {
          id: "a",
          t_ms: 1000,
          label: "walk",
          jump_count: null,
          created_at: "2026-05-15T08:00:00Z",
        },
        {
          id: "b",
          t_ms: 5000,
          label: "trot",
          jump_count: null,
          created_at: "2026-05-15T08:00:05Z",
        },
        {
          id: "c",
          t_ms: 9000,
          label: "gallop",
          jump_count: null,
          created_at: "2026-05-15T08:00:09Z",
        },
      ],
      error: null,
    });
    const { GET } = await import("@/app/api/sessions/[id]/live-labels/route");
    const res = await GET(fakeReq(), { params: Promise.resolve({ id: SESSION_ID }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      labels: Array<{ id: string; t_ms: number; label: string }>;
    };
    expect(body.labels.map((l) => l.label)).toEqual(["walk", "trot", "gallop"]);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
