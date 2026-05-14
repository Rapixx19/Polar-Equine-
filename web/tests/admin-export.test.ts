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
  samples: Array<Record<string, unknown>>;
  metrics: Record<string, unknown> | null;
  labels: Array<Record<string, unknown>>;
  signalEvents: Array<Record<string, unknown>>;
};

const getUserMock = vi.fn();
const db: Db = {
  isAdmin: true,
  sessionRow: null,
  samples: [],
  metrics: null,
  labels: [],
  signalEvents: [],
};

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
      if (table === "samples_hr") {
        return {
          select: () => ({
            eq: () => ({ order: async () => ({ data: db.samples, error: null }) }),
          }),
        };
      }
      if (table === "session_metrics") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: db.metrics, error: null }) }),
          }),
        };
      }
      if (table === "label_corrections") {
        return {
          select: () => ({
            eq: () => ({ order: async () => ({ data: db.labels, error: null }) }),
          }),
        };
      }
      if (table === "session_signal_events") {
        return {
          select: () => ({
            eq: () => ({ order: async () => ({ data: db.signalEvents, error: null }) }),
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
  db.samples = [];
  db.metrics = null;
  db.labels = [];
  db.signalEvents = [];
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const fakeReq = (): NextRequest => ({}) as NextRequest;

function seedSession() {
  db.sessionRow = {
    id: SESSION_ID,
    rider_id: RIDER_ID,
    horse_id: HORSE_ID,
    activity_type: "riding",
    start_time: new Date(Date.now() - 1800_000).toISOString(),
    end_time: new Date().toISOString(),
    status: "approved",
  };
  db.samples = [{ timestamp_ms: 0, hr_bpm: 70, rr_ms: 850, contact: true }];
  db.metrics = { session_id: SESSION_ID, hr_avg: 75, algo_version: "0.3.1" };
  db.labels = [
    {
      auto_start_ms: 0,
      auto_end_ms: 600_000,
      auto_label_type: "walk",
      auto_jump_count: 0,
      corrected_start_ms: null,
      corrected_end_ms: null,
      corrected_label_type: "walk",
      corrected_jump_count: 0,
      correction_kind: "manual",
      algo_version: "manual-v1",
    },
  ];
}

describe("GET /api/admin/sessions/[id]/export", () => {
  it("returns 401 when unauthenticated", async () => {
    getUserMock.mockReturnValueOnce(null);
    const { GET } = await import("@/app/api/admin/sessions/[id]/export/route");
    const res = await GET(fakeReq(), ctx(SESSION_ID));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    getUserMock.mockReturnValueOnce({ id: ADMIN_ID });
    db.isAdmin = false;
    const { GET } = await import("@/app/api/admin/sessions/[id]/export/route");
    const res = await GET(fakeReq(), ctx(SESSION_ID));
    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid uuid", async () => {
    const { GET } = await import("@/app/api/admin/sessions/[id]/export/route");
    const res = await GET(fakeReq(), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when session row missing", async () => {
    getUserMock.mockReturnValueOnce({ id: ADMIN_ID });
    const { GET } = await import("@/app/api/admin/sessions/[id]/export/route");
    const res = await GET(fakeReq(), ctx(SESSION_ID));
    expect(res.status).toBe(404);
  });

  it("returns 200 anonymised bundle with correct shape + headers", async () => {
    getUserMock.mockReturnValueOnce({ id: ADMIN_ID });
    seedSession();
    const { GET } = await import("@/app/api/admin/sessions/[id]/export/route");
    const res = await GET(fakeReq(), ctx(SESSION_ID));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/attachment;.*\.json/);
    const text = await res.text();
    const bundle = JSON.parse(text);
    expect(bundle.manifest.schema_version).toBe(1);
    expect(bundle.session.rider_pseudonym).toBe("Rider-A");
    expect(bundle.session.horse_pseudonym).toBe("Horse-A");
    expect(bundle.samples_hr).toHaveLength(1);
    expect(bundle.label_corrections).toHaveLength(1);
    expect(text.includes(RIDER_ID)).toBe(false);
    expect(text.includes(HORSE_ID)).toBe(false);
  });
});
