import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
});

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";

const getUserMock = vi.fn();
const db = {
  samples_hr: [{ id: "h1", session_id: SESSION_ID, timestamp_ms: 0, hr_bpm: 70, rr_ms: 850, contact: true }],
  samples_acc: [
    { id: "a1", session_id: SESSION_ID, timestamp_ms: 0, ax: 0.1, ay: -0.05, az: 1 },
    { id: "a2", session_id: SESSION_ID, timestamp_ms: 19, ax: 0.11, ay: -0.06, az: 1.01 },
  ],
  samples_ecg: [
    { id: "e1", session_id: SESSION_ID, timestamp_ms: 0, ecg_uv: 1234 },
    { id: "e2", session_id: SESSION_ID, timestamp_ms: 8, ecg_uv: -567 },
    { id: "e3", session_id: SESSION_ID, timestamp_ms: 16, ecg_uv: 100 },
  ],
};

function ordered<T>(data: T) {
  return { order: async () => ({ data, error: null }) };
}

function buildClient() {
  return {
    auth: {},
    from: (table: string) => {
      if (table === "rider_profiles") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { is_admin: true }, error: null }) }),
          }),
        };
      }
      if (table === "sessions") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: SESSION_ID,
                  rider_id: "33333333-3333-4333-8333-333333333333",
                  horse_id: "44444444-4444-4444-8444-444444444444",
                  band_id: null,
                  activity_type: "riding",
                  start_time: new Date(Date.now() - 1800_000).toISOString(),
                  end_time: new Date().toISOString(),
                  status: "approved",
                  metrics_status: "ready",
                  created_at: new Date().toISOString(),
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "samples_hr") return { select: () => ({ eq: () => ordered(db.samples_hr) }) };
      if (table === "samples_acc") return { select: () => ({ eq: () => ordered(db.samples_acc) }) };
      if (table === "samples_ecg") return { select: () => ({ eq: () => ordered(db.samples_ecg) }) };
      if (table === "labels") return { select: () => ({ eq: () => ordered([]) }) };
      if (table === "label_corrections") return { select: () => ({ eq: () => ordered([]) }) };
      if (table === "session_metrics") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
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
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const fakeReq = (search = ""): NextRequest =>
  ({ nextUrl: new URL(`https://x.test/${search ? "?" + search : ""}`) }) as NextRequest;

async function call(search = "") {
  getUserMock.mockReturnValueOnce({ id: ADMIN_ID });
  const { GET } = await import("@/app/api/admin/sessions/[id]/export-raw/route");
  const res = await GET(fakeReq(search), ctx(SESSION_ID));
  const bundle = JSON.parse(await res.text());
  return { res, bundle };
}

describe("GET /api/admin/sessions/[id]/export-raw — include gate", () => {
  it("default omits ACC + ECG arrays (null), manifest.included.acc=false, ecg=false", async () => {
    const { res, bundle } = await call();
    expect(res.status).toBe(200);
    expect(bundle.samples_acc).toBeNull();
    expect(bundle.samples_ecg).toBeNull();
    expect(bundle.manifest.included).toEqual({ hr: true, acc: false, ecg: false });
  });

  it("default keeps row_counts honest (real counts even when arrays gated)", async () => {
    const { bundle } = await call();
    expect(bundle.manifest.row_counts.samples_acc).toBe(2);
    expect(bundle.manifest.row_counts.samples_ecg).toBe(3);
  });

  it("?include=acc → samples_acc array present, samples_ecg still null", async () => {
    const { bundle } = await call("include=acc");
    expect(Array.isArray(bundle.samples_acc)).toBe(true);
    expect(bundle.samples_acc).toHaveLength(2);
    expect(bundle.samples_acc[0]).not.toHaveProperty("id");
    expect(bundle.samples_acc[0]).not.toHaveProperty("session_id");
    expect(bundle.samples_acc[0]).toMatchObject({ timestamp_ms: 0, ax: 0.1, ay: -0.05, az: 1 });
    expect(bundle.samples_ecg).toBeNull();
    expect(bundle.manifest.included).toEqual({ hr: true, acc: true, ecg: false });
  });

  it("?include=ecg → samples_ecg array present, samples_acc still null", async () => {
    const { bundle } = await call("include=ecg");
    expect(bundle.samples_acc).toBeNull();
    expect(Array.isArray(bundle.samples_ecg)).toBe(true);
    expect(bundle.samples_ecg).toHaveLength(3);
    expect(bundle.samples_ecg[0]).toMatchObject({ timestamp_ms: 0, ecg_uv: 1234 });
    expect(bundle.manifest.included).toEqual({ hr: true, acc: false, ecg: true });
  });

  it("?include=acc,ecg → both arrays present", async () => {
    const { bundle } = await call("include=acc,ecg");
    expect(Array.isArray(bundle.samples_acc)).toBe(true);
    expect(Array.isArray(bundle.samples_ecg)).toBe(true);
    expect(bundle.manifest.included).toEqual({ hr: true, acc: true, ecg: true });
  });

  it("unknown tokens are ignored (?include=foo,acc,bar)", async () => {
    const { bundle } = await call("include=foo,acc,bar");
    expect(Array.isArray(bundle.samples_acc)).toBe(true);
    expect(bundle.samples_ecg).toBeNull();
    expect(bundle.manifest.included.acc).toBe(true);
  });

  it("token casing/whitespace tolerated (?include= ACC , ECG )", async () => {
    const { bundle } = await call("include=%20ACC%20,%20ECG%20");
    expect(bundle.manifest.included).toEqual({ hr: true, acc: true, ecg: true });
  });
});
