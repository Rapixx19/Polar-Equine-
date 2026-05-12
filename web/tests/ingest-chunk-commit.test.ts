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
            return { eq: async () => updateReturn };
          },
        };
      }
      // signal_chunks
      return {
        insert: (row: unknown) => {
          insertSpy(row);
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

// 30 s × 200 Hz × 6 bytes per ACC triplet = 36 000. Stays inside ±20%.
const validAccBody = {
  session_id: SESSION_ID,
  stream: "acc" as const,
  chunk_index: 0,
  start_t_ms: 0,
  end_t_ms: 30_000,
  sample_rate_hz: 200,
  resolution_bits: 16,
  range_g: 8,
  channels: 3,
  byte_count: 36_000,
};

// 30 s × 130 Hz × 4 bytes per ECG sample = 15 600.
const validEcgBody = {
  session_id: SESSION_ID,
  stream: "ecg" as const,
  chunk_index: 0,
  start_t_ms: 0,
  end_t_ms: 30_000,
  sample_rate_hz: 130,
  resolution_bits: 14,
  channels: 1,
  byte_count: 15_600,
};

describe("POST /api/ingest/chunk-commit", () => {
  it("returns 401 when no user", async () => {
    getUserMock.mockReturnValueOnce(null);
    const { POST } = await import("@/app/api/ingest/chunk-commit/route");
    const res = await POST(fakeReq(validAccBody));
    expect(res.status).toBe(401);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("returns 400 on malformed JSON", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/chunk-commit/route");
    const res = await POST(badJsonReq());
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid body schema", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/chunk-commit/route");
    const res = await POST(fakeReq({ session_id: SESSION_ID, stream: "acc" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when end_t_ms < start_t_ms", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/chunk-commit/route");
    const res = await POST(fakeReq({ ...validAccBody, start_t_ms: 30_000, end_t_ms: 0 }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when session does not exist", async () => {
    sessionRow = null;
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/chunk-commit/route");
    const res = await POST(fakeReq(validAccBody));
    expect(res.status).toBe(404);
  });

  it("returns 403 when session belongs to another rider", async () => {
    sessionRow = { id: SESSION_ID, status: "active", rider_id: OTHER_RIDER_ID };
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/chunk-commit/route");
    const res = await POST(fakeReq(validAccBody));
    expect(res.status).toBe(403);
  });

  it("returns 409 when session is not active", async () => {
    sessionRow = { id: SESSION_ID, status: "completed", rider_id: RIDER_ID };
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/chunk-commit/route");
    const res = await POST(fakeReq(validAccBody));
    expect(res.status).toBe(409);
  });

  it("returns 400 when byte_count is out of ±20% tolerance", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/chunk-commit/route");
    // 36 000 expected → 50 000 is way past +20% (43 200).
    const res = await POST(fakeReq({ ...validAccBody, byte_count: 50_000 }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string; expected: number; observed: number };
    expect(json.error).toBe("byte_count_out_of_tolerance");
    expect(json.expected).toBe(36_000);
    expect(json.observed).toBe(50_000);
  });

  it("happy path (ACC): inserts row with computed storage_path and updates last_ingest_at", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/chunk-commit/route");
    const res = await POST(fakeReq({ ...validAccBody, chunk_index: 5 }));
    expect(res.status).toBe(200);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const row = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(row).toMatchObject({
      session_id: SESSION_ID,
      stream: "acc",
      chunk_index: 5,
      start_t_ms: 0,
      end_t_ms: 30_000,
      sample_rate_hz: 200,
      resolution_bits: 16,
      range_g: 8,
      channels: 3,
      byte_count: 36_000,
      storage_path: `${SESSION_ID}/acc/000005.bin`,
    });
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const patch = updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(typeof patch.last_ingest_at).toBe("string");
  });

  it("happy path (ECG): range_g defaults to null in the inserted row", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/chunk-commit/route");
    const res = await POST(fakeReq(validEcgBody));
    expect(res.status).toBe(200);
    const row = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(row.stream).toBe("ecg");
    expect(row.range_g).toBeNull();
    expect(row.channels).toBe(1);
    expect(row.byte_count).toBe(15_600);
  });

  it("returns 403 when RLS denies the insert (42501)", async () => {
    insertReturn = { data: null, error: { code: "42501", message: "rls" } };
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/chunk-commit/route");
    const res = await POST(fakeReq(validAccBody));
    expect(res.status).toBe(403);
  });

  it("returns 200 idempotent:true on 23505 unique violation (client retry already landed)", async () => {
    insertReturn = { data: null, error: { code: "23505", message: "dup" } };
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/chunk-commit/route");
    const res = await POST(fakeReq(validAccBody));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; idempotent?: boolean };
    expect(json).toEqual({ ok: true, idempotent: true });
  });

  it("returns 500 on a non-RLS, non-unique DB error", async () => {
    insertReturn = { data: null, error: { code: "08006", message: "conn lost" } };
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/chunk-commit/route");
    const res = await POST(fakeReq(validAccBody));
    expect(res.status).toBe(500);
  });

  it("ignores last_ingest_at update failures (best-effort heartbeat)", async () => {
    updateReturn = { error: { code: "42501", message: "rls" } };
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/chunk-commit/route");
    const res = await POST(fakeReq(validAccBody));
    expect(res.status).toBe(200);
  });
});
