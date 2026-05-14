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

type Db = {
  isAdmin: boolean;
  sessionRow: Record<string, unknown> | null;
  samples_hr: Array<Record<string, unknown>>;
  samples_acc: Array<Record<string, unknown>>;
  samples_ecg: Array<Record<string, unknown>>;
  labels: Array<Record<string, unknown>>;
  label_corrections: Array<Record<string, unknown>>;
  metrics: Record<string, unknown> | null;
};

const getUserMock = vi.fn();
const db: Db = {
  isAdmin: true,
  sessionRow: null,
  samples_hr: [],
  samples_acc: [],
  samples_ecg: [],
  labels: [],
  label_corrections: [],
  metrics: null,
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
            eq: () => ({
              maybeSingle: async () => ({ data: { is_admin: db.isAdmin }, error: null }),
            }),
          }),
        };
      }
      if (table === "sessions") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: db.sessionRow, error: null }) }),
          }),
        };
      }
      if (table === "samples_hr") return { select: () => ({ eq: () => ordered(db.samples_hr) }) };
      if (table === "samples_acc") return { select: () => ({ eq: () => ordered(db.samples_acc) }) };
      if (table === "samples_ecg") return { select: () => ({ eq: () => ordered(db.samples_ecg) }) };
      if (table === "labels") return { select: () => ({ eq: () => ordered(db.labels) }) };
      if (table === "label_corrections") {
        return { select: () => ({ eq: () => ordered(db.label_corrections) }) };
      }
      if (table === "session_metrics") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: db.metrics, error: null }) }),
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
  db.samples_hr = [];
  db.samples_acc = [];
  db.samples_ecg = [];
  db.labels = [];
  db.label_corrections = [];
  db.metrics = null;
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const fakeReq = (search = ""): NextRequest =>
  ({ nextUrl: new URL(`https://x.test/${search ? "?" + search : ""}`) }) as NextRequest;

function seedSession() {
  db.sessionRow = {
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
  };
  db.samples_hr = [
    { id: "s1", session_id: SESSION_ID, timestamp_ms: 0, hr_bpm: 70, rr_ms: 850, contact: true },
  ];
  db.labels = [
    { id: "l1", session_id: SESSION_ID, start_ms: 0, end_ms: 60_000, label_type: "walk", algo_version: "0.3.1" },
  ];
  db.label_corrections = [
    {
      id: "lc1",
      session_id: SESSION_ID,
      auto_start_ms: 0,
      auto_end_ms: 60_000,
      auto_label_type: "walk",
      corrected_label_type: "walk",
      correction_kind: "approved",
    },
  ];
  db.metrics = { session_id: SESSION_ID, hr_avg: 75, algo_version: "0.3.1" };
}

describe("GET /api/admin/sessions/[id]/export-raw", () => {
  it("returns 401 when unauthenticated", async () => {
    getUserMock.mockReturnValueOnce(null);
    const { GET } = await import("@/app/api/admin/sessions/[id]/export-raw/route");
    const res = await GET(fakeReq(), ctx(SESSION_ID));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    getUserMock.mockReturnValueOnce({ id: ADMIN_ID });
    db.isAdmin = false;
    const { GET } = await import("@/app/api/admin/sessions/[id]/export-raw/route");
    const res = await GET(fakeReq(), ctx(SESSION_ID));
    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid uuid", async () => {
    const { GET } = await import("@/app/api/admin/sessions/[id]/export-raw/route");
    const res = await GET(fakeReq(), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when session row missing", async () => {
    getUserMock.mockReturnValueOnce({ id: ADMIN_ID });
    const { GET } = await import("@/app/api/admin/sessions/[id]/export-raw/route");
    const res = await GET(fakeReq(), ctx(SESSION_ID));
    expect(res.status).toBe(404);
  });

  it("returns 200 verbatim bundle with pseudonyms, no PII, sensor sources, row counts", async () => {
    getUserMock.mockReturnValueOnce({ id: ADMIN_ID });
    seedSession();
    const { GET } = await import("@/app/api/admin/sessions/[id]/export-raw/route");
    const res = await GET(fakeReq(), ctx(SESSION_ID));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/attachment;.*raw\.json/);
    const text = await res.text();
    const bundle = JSON.parse(text);

    expect(bundle.manifest.shape).toBe("raw-verbatim");
    expect(bundle.manifest.schema_version).toBe(1);
    expect(bundle.manifest.session_id).toBe(SESSION_ID);
    expect(bundle.manifest.algo_version).toBe("0.3.1");
    expect(bundle.manifest.sensor_sources.samples_hr).toContain("Polar H10");
    expect(bundle.manifest.row_counts).toEqual({
      samples_hr: 1,
      samples_acc: 0,
      samples_ecg: 0,
      labels: 1,
      label_corrections: 1,
    });

    expect(bundle.session.rider_pseudonym).toBe("Rider-A");
    expect(bundle.session.horse_pseudonym).toBe("Horse-A");
    expect(bundle.session).not.toHaveProperty("rider_id");
    expect(bundle.session).not.toHaveProperty("horse_id");

    expect(bundle.samples_hr[0]).not.toHaveProperty("id");
    expect(bundle.samples_hr[0]).not.toHaveProperty("session_id");
    expect(bundle.samples_hr[0].timestamp_ms).toBe(0);
    expect(bundle.samples_hr[0].rr_ms).toBe(850);
    expect(bundle.label_corrections[0].auto_label_type).toBe("walk");

    expect(text.includes(RIDER_ID)).toBe(false);
    expect(text.includes(HORSE_ID)).toBe(false);
  });
});
