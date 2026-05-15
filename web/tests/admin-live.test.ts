import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
});

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

type Db = {
  isAdmin: boolean;
  sessionRow: Record<string, unknown> | null;
  activeRows: Array<Record<string, unknown>>;
  hrCount: number;
  accCount: number;
  ecgCount: number;
  recentHr: Array<{ timestamp_ms: number; hr_bpm: number }>;
};

const getUserMock = vi.fn();
const db: Db = {
  isAdmin: true,
  sessionRow: null,
  activeRows: [],
  hrCount: 0,
  accCount: 0,
  ecgCount: 0,
  recentHr: [],
};

function buildClient() {
  return {
    from: (table: string) => {
      if (table === "rider_profiles") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { is_admin: db.isAdmin }, error: null }) }),
          }),
        };
      }
      if (table === "sessions") {
        return {
          select: () => ({
            eq: (col: string) => {
              if (col === "status") {
                return {
                  order: () => ({ limit: async () => ({ data: db.activeRows, error: null }) }),
                };
              }
              return { maybeSingle: async () => ({ data: db.sessionRow, error: null }) };
            },
          }),
        };
      }
      if (table === "samples_hr") {
        return {
          select: (_cols: string, opts?: { count?: string; head?: boolean }) => ({
            eq: () => {
              if (opts?.head) {
                return Promise.resolve({ count: db.hrCount, error: null }) as unknown as {
                  count: number;
                  error: null;
                };
              }
              return {
                order: () => ({ limit: async () => ({ data: db.recentHr, error: null }) }),
              };
            },
          }),
        };
      }
      if (table === "samples_acc") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({ count: db.accCount, error: null }) as unknown as {
                count: number;
                error: null;
              },
          }),
        };
      }
      if (table === "samples_ecg") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({ count: db.ecgCount, error: null }) as unknown as {
                count: number;
                error: null;
              },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

vi.mock("@/lib/auth/server", () => ({
  createServerSupabaseClient: async () => buildClient(),
  getUser: async () => getUserMock(),
}));

afterEach(() => {
  vi.clearAllMocks();
  getUserMock.mockReset();
  db.isAdmin = true;
  db.sessionRow = null;
  db.activeRows = [];
  db.hrCount = 0;
  db.accCount = 0;
  db.ecgCount = 0;
  db.recentHr = [];
});

function fakeReq(): NextRequest {
  return {} as unknown as NextRequest;
}

describe("GET /api/admin/sessions/[id]/live", () => {
  it("401 when no user", async () => {
    getUserMock.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/admin/sessions/[id]/live/route");
    const res = await GET(fakeReq(), { params: Promise.resolve({ id: SESSION_ID }) });
    expect(res.status).toBe(401);
  });

  it("403 when not admin", async () => {
    getUserMock.mockResolvedValueOnce({ id: "x" });
    db.isAdmin = false;
    const { GET } = await import("@/app/api/admin/sessions/[id]/live/route");
    const res = await GET(fakeReq(), { params: Promise.resolve({ id: SESSION_ID }) });
    expect(res.status).toBe(403);
  });

  it("400 on invalid uuid", async () => {
    getUserMock.mockResolvedValueOnce({ id: "x" });
    const { GET } = await import("@/app/api/admin/sessions/[id]/live/route");
    const res = await GET(fakeReq(), { params: Promise.resolve({ id: "not-a-uuid" }) });
    expect(res.status).toBe(400);
  });

  it("404 when session missing", async () => {
    getUserMock.mockResolvedValueOnce({ id: "x" });
    db.sessionRow = null;
    const { GET } = await import("@/app/api/admin/sessions/[id]/live/route");
    const res = await GET(fakeReq(), { params: Promise.resolve({ id: SESSION_ID }) });
    expect(res.status).toBe(404);
  });

  it("200 returns snapshot with counts + reversed recent_hr", async () => {
    getUserMock.mockResolvedValueOnce({ id: "x" });
    db.sessionRow = {
      id: SESSION_ID,
      status: "active",
      start_time: "2026-05-15T08:00:00Z",
      end_time: null,
      last_ingest_at: "2026-05-15T08:05:00Z",
    };
    db.hrCount = 300;
    db.accCount = 15_000;
    db.ecgCount = 39_000;
    // DB returns newest-first; route reverses to oldest-first.
    db.recentHr = [
      { timestamp_ms: 3000, hr_bpm: 152 },
      { timestamp_ms: 2000, hr_bpm: 150 },
      { timestamp_ms: 1000, hr_bpm: 148 },
    ];
    const { GET } = await import("@/app/api/admin/sessions/[id]/live/route");
    const res = await GET(fakeReq(), { params: Promise.resolve({ id: SESSION_ID }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      sample_counts: { hr: number; acc: number; ecg: number };
      latest_hr: { bpm: number; ts_ms: number } | null;
      recent_hr: Array<{ ts_ms: number; bpm: number }>;
    };
    expect(body.status).toBe("active");
    expect(body.sample_counts).toEqual({ hr: 300, acc: 15_000, ecg: 39_000 });
    expect(body.recent_hr.map((s) => s.ts_ms)).toEqual([1000, 2000, 3000]);
    expect(body.latest_hr?.bpm).toBe(152);
  });
});

describe("GET /api/admin/live-sessions", () => {
  it("401 when no user", async () => {
    getUserMock.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/admin/live-sessions/route");
    const res = await GET(fakeReq());
    expect(res.status).toBe(401);
  });

  it("403 when not admin", async () => {
    getUserMock.mockResolvedValueOnce({ id: "x" });
    db.isAdmin = false;
    const { GET } = await import("@/app/api/admin/live-sessions/route");
    const res = await GET(fakeReq());
    expect(res.status).toBe(403);
  });

  it("200 flattens rider/horse joins", async () => {
    getUserMock.mockResolvedValueOnce({ id: "x" });
    db.activeRows = [
      {
        id: SESSION_ID,
        activity_type: "ride",
        start_time: "2026-05-15T08:00:00Z",
        last_ingest_at: "2026-05-15T08:01:00Z",
        has_prototype_mount: true,
        horses: { name: "Comet" },
        rider_profiles: { display_name: "Ferdinand" },
      },
    ];
    const { GET } = await import("@/app/api/admin/live-sessions/route");
    const res = await GET(fakeReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      active: Array<{ id: string; rider_name: string | null; horse_name: string | null }>;
    };
    expect(body.active).toHaveLength(1);
    expect(body.active[0].rider_name).toBe("Ferdinand");
    expect(body.active[0].horse_name).toBe("Comet");
  });
});
