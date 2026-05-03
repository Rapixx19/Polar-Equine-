import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  process.env.ADMIN_EMAILS = "ferdinand.straehuber@gmail.com";
});

const insertSpy = vi.fn<(...args: unknown[]) => void>();
const updateSpy = vi.fn<(...args: unknown[]) => void>();
const getUserMock = vi.fn();

type SessionRow = { id: string; status: string; rider_id: string } | null;
type InsertReturn = { data: Array<{ id: number }> | null; error: { code?: string; message?: string } | null };
type UpdateReturn = { error: { code?: string; message?: string } | null };

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const RIDER_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_RIDER_ID = "55555555-5555-4555-8555-555555555555";

let sessionRow: SessionRow = { id: SESSION_ID, status: "active", rider_id: RIDER_ID };
let insertReturn: InsertReturn = { data: [{ id: 1 }], error: null };
let updateReturn: UpdateReturn = { error: null };

function buildClient() {
  return {
    auth: {},
    from: vi.fn((table: string) => {
      if (table === "sessions") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: sessionRow, error: null }),
            }),
          }),
          update: (patch: unknown) => {
            updateSpy(patch);
            return {
              eq: async () => updateReturn,
            };
          },
        };
      }
      // samples_hr
      return {
        insert: (rows: unknown) => {
          insertSpy(rows);
          return {
            select: async () => insertReturn,
          };
        },
      };
    }),
  };
}

vi.mock("@/lib/auth/server", () => ({
  createServerSupabaseClient: async () => buildClient(),
  getUser: async () => getUserMock(),
}));

afterEach(() => {
  vi.clearAllMocks();
  getUserMock.mockReset();
  sessionRow = { id: SESSION_ID, status: "active", rider_id: RIDER_ID };
  insertReturn = { data: [{ id: 1 }], error: null };
  updateReturn = { error: null };
});

function fakeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}
function badJsonReq(): NextRequest {
  return { json: async () => { throw new Error("bad json"); } } as unknown as NextRequest;
}
function sample(overrides: Partial<{ t_ms: number; hr_bpm: number; rr_ms: number | null; contact: boolean | null }> = {}) {
  return { t_ms: 1_000_000, hr_bpm: 70, rr_ms: 850, contact: true, ...overrides };
}
const validBody = {
  session_id: SESSION_ID,
  samples: { hr: [sample(), sample({ t_ms: 1_001_000 }), sample({ t_ms: 1_002_000 })] },
};

describe("POST /api/ingest/samples", () => {
  it("returns 401 when no user", async () => {
    getUserMock.mockReturnValueOnce(null);
    const { POST } = await import("@/app/api/ingest/samples/route");
    const res = await POST(fakeReq(validBody));
    expect(res.status).toBe(401);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("returns 400 on malformed JSON", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/samples/route");
    const res = await POST(badJsonReq());
    expect(res.status).toBe(400);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("returns 400 on missing session_id", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/samples/route");
    const res = await POST(fakeReq({ samples: { hr: [sample()] } }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid uuid in session_id", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/samples/route");
    const res = await POST(fakeReq({ session_id: "not-a-uuid", samples: { hr: [sample()] } }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when hr_bpm is out of range (e.g. 999)", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/samples/route");
    const res = await POST(fakeReq({ session_id: SESSION_ID, samples: { hr: [sample({ hr_bpm: 999 })] } }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when session_id does not exist", async () => {
    sessionRow = null;
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/samples/route");
    const res = await POST(fakeReq(validBody));
    expect(res.status).toBe(404);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("returns 403 when session belongs to another rider", async () => {
    sessionRow = { id: SESSION_ID, status: "active", rider_id: OTHER_RIDER_ID };
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/samples/route");
    const res = await POST(fakeReq(validBody));
    expect(res.status).toBe(403);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("returns 409 when session.status is completed", async () => {
    sessionRow = { id: SESSION_ID, status: "completed", rider_id: RIDER_ID };
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/samples/route");
    const res = await POST(fakeReq(validBody));
    expect(res.status).toBe(409);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("returns 200 with received.hr=0 on empty array, no DB insert", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/samples/route");
    const res = await POST(fakeReq({ session_id: SESSION_ID, samples: { hr: [] } }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { received: { hr: number } };
    expect(json.received.hr).toBe(0);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("happy path: 3 samples → 200 with received.hr=3, single bulk insert + last_ingest_at update", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/samples/route");
    const res = await POST(fakeReq(validBody));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { received: { hr: number } };
    expect(json.received.hr).toBe(3);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const rows = insertSpy.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      session_id: SESSION_ID,
      timestamp_ms: 1_000_000,
      hr_bpm: 70,
      rr_ms: 850,
      contact: true,
    });
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const patch = updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(typeof patch.last_ingest_at).toBe("string");
  });

  it("returns 403 when RLS denies the insert (42501)", async () => {
    insertReturn = { data: null, error: { code: "42501", message: "rls" } };
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/samples/route");
    const res = await POST(fakeReq(validBody));
    expect(res.status).toBe(403);
  });

  it("returns 500 on a non-RLS DB error", async () => {
    insertReturn = { data: null, error: { code: "23505", message: "dup" } };
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/samples/route");
    const res = await POST(fakeReq(validBody));
    expect(res.status).toBe(500);
  });
});
