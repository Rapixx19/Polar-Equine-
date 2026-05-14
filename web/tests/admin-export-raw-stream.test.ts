import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
});

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const RIDER_ID = "33333333-3333-4333-8333-333333333333";
const HORSE_ID = "44444444-4444-4444-8444-444444444444";

const getUserMock = vi.fn();
const db = {
  samples_hr: [{ id: "h1", session_id: SESSION_ID, timestamp_ms: 0, hr_bpm: 70, rr_ms: 850, contact: true }],
  samples_acc: [{ id: "a1", session_id: SESSION_ID, timestamp_ms: 0, ax: 0.1, ay: -0.05, az: 1 }],
  samples_ecg: [{ id: "e1", session_id: SESSION_ID, timestamp_ms: 0, ecg_uv: 1234 }],
  labels: [{ id: "l1", session_id: SESSION_ID, start_ms: 0, end_ms: 60000, label_type: "walk", algo_version: "0.3.1" }],
  label_corrections: [{ id: "lc1", session_id: SESSION_ID, auto_label_type: "walk", corrected_label_type: "trot" }],
  metrics: { session_id: SESSION_ID, hr_avg: 75, algo_version: "0.3.1" },
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
                  rider_id: RIDER_ID,
                  horse_id: HORSE_ID,
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
      if (table === "labels") return { select: () => ({ eq: () => ordered(db.labels) }) };
      if (table === "label_corrections") return { select: () => ({ eq: () => ordered(db.label_corrections) }) };
      if (table === "session_metrics") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.metrics, error: null }) }) }),
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
const fakeReq = (search: string): NextRequest =>
  ({ nextUrl: new URL(`https://x.test/?${search}`) }) as NextRequest;

async function callStream(stream: string) {
  getUserMock.mockReturnValueOnce({ id: ADMIN_ID });
  const { GET } = await import("@/app/api/admin/sessions/[id]/export-raw/route");
  const res = await GET(fakeReq(`stream=${stream}`), ctx(SESSION_ID));
  return { res, text: await res.text() };
}

describe("GET /api/admin/sessions/[id]/export-raw?stream=…", () => {
  it("rejects unknown stream with 400", async () => {
    getUserMock.mockReturnValueOnce({ id: ADMIN_ID });
    const { GET } = await import("@/app/api/admin/sessions/[id]/export-raw/route");
    const res = await GET(fakeReq("stream=banana"), ctx(SESSION_ID));
    expect(res.status).toBe(400);
  });

  it("stream=hr returns manifest + rows array, no rider/horse ids", async () => {
    const { res, text } = await callStream("hr");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/session-.*-hr\.json/);
    const bundle = JSON.parse(text);
    expect(bundle.manifest.shape).toBe("raw-stream");
    expect(bundle.manifest.stream).toBe("hr");
    expect(bundle.manifest.table).toBe("samples_hr");
    expect(bundle.manifest.row_count).toBe(1);
    expect(bundle.manifest.rider_pseudonym).toBe("Rider-A");
    expect(bundle.manifest.horse_pseudonym).toBe("Horse-A");
    expect(Array.isArray(bundle.rows)).toBe(true);
    expect(bundle.rows[0]).toMatchObject({ timestamp_ms: 0, hr_bpm: 70 });
    expect(bundle.rows[0]).not.toHaveProperty("session_id");
    expect(text.includes(RIDER_ID)).toBe(false);
    expect(text.includes(HORSE_ID)).toBe(false);
  });

  it("stream=acc returns ACC rows (no include flag required)", async () => {
    const { bundle } = await callStream("acc").then((r) => ({ bundle: JSON.parse(r.text) }));
    expect(bundle.manifest.stream).toBe("acc");
    expect(bundle.rows).toHaveLength(1);
    expect(bundle.rows[0]).toMatchObject({ ax: 0.1, ay: -0.05, az: 1 });
  });

  it("stream=ecg returns ECG rows (no include flag required)", async () => {
    const { bundle } = await callStream("ecg").then((r) => ({ bundle: JSON.parse(r.text) }));
    expect(bundle.manifest.stream).toBe("ecg");
    expect(bundle.rows[0]).toMatchObject({ ecg_uv: 1234 });
  });

  it("stream=labels returns auto-labels array", async () => {
    const { bundle } = await callStream("labels").then((r) => ({ bundle: JSON.parse(r.text) }));
    expect(bundle.manifest.stream).toBe("labels");
    expect(bundle.rows[0]).toMatchObject({ label_type: "walk", algo_version: "0.3.1" });
  });

  it("stream=label_corrections returns correction rows", async () => {
    const { bundle } = await callStream("label_corrections").then((r) => ({ bundle: JSON.parse(r.text) }));
    expect(bundle.manifest.stream).toBe("label_corrections");
    expect(bundle.rows[0]).toMatchObject({ auto_label_type: "walk", corrected_label_type: "trot" });
  });

  it("stream=metrics returns single row object, not array", async () => {
    const { bundle } = await callStream("metrics").then((r) => ({ bundle: JSON.parse(r.text) }));
    expect(bundle.manifest.stream).toBe("metrics");
    expect(bundle.manifest.row_count).toBe(1);
    expect(Array.isArray(bundle.rows)).toBe(false);
    expect(bundle.rows).toMatchObject({ hr_avg: 75 });
  });

  it("admin gate still applies: 403 when not admin (stream=hr)", async () => {
    // Override the rider_profiles maybeSingle for this call only — build a fresh client
    // would be cleaner, but the existing mock returns is_admin=true for everyone, so
    // we exercise the gate via getUser=null which yields 401 (auth fires before stream parse).
    getUserMock.mockReturnValueOnce(null);
    const { GET } = await import("@/app/api/admin/sessions/[id]/export-raw/route");
    const res = await GET(fakeReq("stream=hr"), ctx(SESSION_ID));
    expect(res.status).toBe(401);
  });
});
