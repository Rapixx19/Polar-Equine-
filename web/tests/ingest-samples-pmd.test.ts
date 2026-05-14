import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
});

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const RIDER_ID = "44444444-4444-4444-8444-444444444444";

type InsertReturn = { data: Array<{ id: number }> | null; error: { code?: string; message?: string } | null };

const hrSpy = vi.fn<(rows: unknown) => void>();
const accSpy = vi.fn<(rows: unknown) => void>();
const ecgSpy = vi.fn<(rows: unknown) => void>();
const getUserMock = vi.fn();

let accReturn: InsertReturn = { data: [{ id: 1 }], error: null };
let ecgReturn: InsertReturn = { data: [{ id: 1 }], error: null };

function buildClient() {
  return {
    auth: {},
    from: vi.fn((table: string) => {
      if (table === "sessions") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: SESSION_ID, status: "active", rider_id: RIDER_ID },
                error: null,
              }),
            }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      if (table === "samples_hr") {
        return {
          insert: (rows: unknown) => {
            hrSpy(rows);
            return { select: async () => ({ data: [{ id: 1 }], error: null }) };
          },
        };
      }
      if (table === "samples_acc") {
        return {
          insert: (rows: unknown) => {
            accSpy(rows);
            return { select: async () => accReturn };
          },
        };
      }
      if (table === "samples_ecg") {
        return {
          insert: (rows: unknown) => {
            ecgSpy(rows);
            return { select: async () => ecgReturn };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
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
  accReturn = { data: [{ id: 1 }], error: null };
  ecgReturn = { data: [{ id: 1 }], error: null };
});

function fakeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

describe("POST /api/ingest/samples — PMD streams (Slice 12)", () => {
  it("happy path: ACC payload only → 200, only samples_acc insert called", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/samples/route");
    const body = {
      session_id: SESSION_ID,
      samples: {
        acc: [
          { t_ms: 1000, ax_mg: 100, ay_mg: -50, az_mg: 1000 },
          { t_ms: 1019, ax_mg: 110, ay_mg: -60, az_mg: 1010 },
        ],
      },
    };
    const res = await POST(fakeReq(body));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { received: { hr: number; acc: number; ecg: number } };
    expect(json.received).toEqual({ hr: 0, acc: 2, ecg: 0 });
    expect(hrSpy).not.toHaveBeenCalled();
    expect(ecgSpy).not.toHaveBeenCalled();
    expect(accSpy).toHaveBeenCalledTimes(1);
    const rows = accSpy.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ session_id: SESSION_ID, timestamp_ms: 1000, ax: 0.1, ay: -0.05, az: 1 });
  });

  it("happy path: ECG payload only → 200, only samples_ecg insert called", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/samples/route");
    const body = {
      session_id: SESSION_ID,
      samples: { ecg: [{ t_ms: 1000, uv: 1234 }, { t_ms: 1008, uv: -567 }] },
    };
    const res = await POST(fakeReq(body));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { received: { hr: number; acc: number; ecg: number } };
    expect(json.received).toEqual({ hr: 0, acc: 0, ecg: 2 });
    expect(accSpy).not.toHaveBeenCalled();
    expect(ecgSpy).toHaveBeenCalledTimes(1);
    const rows = ecgSpy.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ session_id: SESSION_ID, timestamp_ms: 1000, ecg_uv: 1234 });
  });

  it("mixed HR + ACC + ECG → all three inserts fire, received counts correct", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/samples/route");
    const body = {
      session_id: SESSION_ID,
      samples: {
        hr: [{ t_ms: 1000, hr_bpm: 70, rr_ms: 850, contact: true }],
        acc: [{ t_ms: 1000, ax_mg: 100, ay_mg: 0, az_mg: 1000 }],
        ecg: [{ t_ms: 1000, uv: 100 }],
      },
    };
    const res = await POST(fakeReq(body));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { received: { hr: number; acc: number; ecg: number } };
    expect(json.received).toEqual({ hr: 1, acc: 1, ecg: 1 });
    expect(hrSpy).toHaveBeenCalledTimes(1);
    expect(accSpy).toHaveBeenCalledTimes(1);
    expect(ecgSpy).toHaveBeenCalledTimes(1);
  });

  it("returns 400 on out-of-range ACC sample (ax_mg = 20000)", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/samples/route");
    const body = {
      session_id: SESSION_ID,
      samples: { acc: [{ t_ms: 1000, ax_mg: 20000, ay_mg: 0, az_mg: 0 }] },
    };
    const res = await POST(fakeReq(body));
    expect(res.status).toBe(400);
    expect(accSpy).not.toHaveBeenCalled();
  });

  it("returns 400 on out-of-range ECG sample (uv = 99999999)", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/samples/route");
    const body = {
      session_id: SESSION_ID,
      samples: { ecg: [{ t_ms: 1000, uv: 99_999_999 }] },
    };
    const res = await POST(fakeReq(body));
    expect(res.status).toBe(400);
    expect(ecgSpy).not.toHaveBeenCalled();
  });

  it("returns 403 when RLS denies ACC insert (42501)", async () => {
    accReturn = { data: null, error: { code: "42501", message: "rls" } };
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/samples/route");
    const body = {
      session_id: SESSION_ID,
      samples: { acc: [{ t_ms: 1000, ax_mg: 100, ay_mg: 0, az_mg: 1000 }] },
    };
    const res = await POST(fakeReq(body));
    expect(res.status).toBe(403);
  });

  it("returns 500 on non-RLS ECG insert error", async () => {
    ecgReturn = { data: null, error: { code: "23505", message: "dup" } };
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/samples/route");
    const body = {
      session_id: SESSION_ID,
      samples: { ecg: [{ t_ms: 1000, uv: 100 }] },
    };
    const res = await POST(fakeReq(body));
    expect(res.status).toBe(500);
  });

  it("empty samples object → 200, no inserts", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/samples/route");
    const res = await POST(fakeReq({ session_id: SESSION_ID, samples: {} }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { received: { hr: number; acc: number; ecg: number } };
    expect(json.received).toEqual({ hr: 0, acc: 0, ecg: 0 });
    expect(hrSpy).not.toHaveBeenCalled();
    expect(accSpy).not.toHaveBeenCalled();
    expect(ecgSpy).not.toHaveBeenCalled();
  });
});
