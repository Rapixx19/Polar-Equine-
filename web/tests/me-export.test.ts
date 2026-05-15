import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
});

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";

type Db = {
  profile: Record<string, unknown> | null;
  profileErr: { message: string } | null;
  horses: Array<Record<string, unknown>>;
  sessions: Array<Record<string, unknown>>;
  hr: Array<Record<string, unknown>>;
  acc: Array<Record<string, unknown>>;
  ecg: Array<Record<string, unknown>>;
  metrics: Array<Record<string, unknown>>;
  signalEvents: Array<Record<string, unknown>>;
  labels: Array<Record<string, unknown>>;
};

const getUserMock = vi.fn();
const db: Db = {
  profile: null,
  profileErr: null,
  horses: [],
  sessions: [],
  hr: [],
  acc: [],
  ecg: [],
  metrics: [],
  signalEvents: [],
  labels: [],
};

function buildClient() {
  return {
    from: (table: string) => {
      if (table === "rider_profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: db.profile, error: db.profileErr }),
            }),
          }),
        };
      }
      if (table === "sessions") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: db.sessions, error: null }),
            }),
          }),
        };
      }
      if (table === "horses") {
        return {
          select: async () => ({ data: db.horses, error: null }),
        };
      }
      if (table === "samples_hr") {
        return {
          select: () => ({
            in: () => ({ order: async () => ({ data: db.hr, error: null }) }),
          }),
        };
      }
      if (table === "samples_acc") {
        return {
          select: () => ({
            in: () => ({ order: async () => ({ data: db.acc, error: null }) }),
          }),
        };
      }
      if (table === "samples_ecg") {
        return {
          select: () => ({
            in: () => ({ order: async () => ({ data: db.ecg, error: null }) }),
          }),
        };
      }
      if (table === "session_metrics") {
        return {
          select: () => ({ in: async () => ({ data: db.metrics, error: null }) }),
        };
      }
      if (table === "session_signal_events") {
        return {
          select: () => ({ in: async () => ({ data: db.signalEvents, error: null }) }),
        };
      }
      if (table === "label_corrections") {
        return {
          select: () => ({ in: async () => ({ data: db.labels, error: null }) }),
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
  db.profile = null;
  db.profileErr = null;
  db.horses = [];
  db.sessions = [];
  db.hr = [];
  db.acc = [];
  db.ecg = [];
  db.metrics = [];
  db.signalEvents = [];
  db.labels = [];
});

function fakeReq(): NextRequest {
  return {} as unknown as NextRequest;
}

describe("GET /api/me/export", () => {
  it("401 when not authenticated", async () => {
    getUserMock.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/me/export/route");
    const res = await GET(fakeReq());
    expect(res.status).toBe(401);
  });

  it("200 empty bundle when caller has no sessions", async () => {
    getUserMock.mockResolvedValueOnce({ id: USER_ID });
    db.profile = { id: USER_ID, display_name: "Ferdinand", is_admin: false };
    const { GET } = await import("@/app/api/me/export/route");
    const res = await GET(fakeReq());
    expect(res.status).toBe(200);
    const body = JSON.parse(await res.text());
    expect(body.manifest.user_id).toBe(USER_ID);
    expect(body.manifest.schema_version).toBe(1);
    expect(body.rider_profile?.display_name).toBe("Ferdinand");
    expect(body.sessions).toEqual([]);
    expect(body.samples_hr).toEqual([]);
  });

  it("200 includes own sessions + samples + metrics + labels", async () => {
    getUserMock.mockResolvedValueOnce({ id: USER_ID });
    db.profile = { id: USER_ID, display_name: "Ferdinand", is_admin: false };
    db.horses = [{ id: "h-1", name: "Comet" }];
    db.sessions = [
      { id: SESSION_ID, rider_id: USER_ID, status: "approved", activity_type: "riding" },
    ];
    db.hr = [{ session_id: SESSION_ID, timestamp_ms: 1000, hr_bpm: 65, rr_ms: 920, contact: true }];
    db.acc = [{ session_id: SESSION_ID, timestamp_ms: 1000, ax: 0.1, ay: 0.0, az: 1.0 }];
    db.ecg = [];
    db.metrics = [{ session_id: SESSION_ID, rmssd: 42, sdnn: 60 }];
    db.signalEvents = [{ session_id: SESSION_ID, kind: "weak", t_start_ms: 0, t_end_ms: 500 }];
    db.labels = [
      {
        session_id: SESSION_ID,
        auto_start_ms: 0,
        auto_end_ms: 60000,
        auto_label_type: "walk",
        corrected_label_type: "trot",
      },
    ];

    const { GET } = await import("@/app/api/me/export/route");
    const res = await GET(fakeReq());
    expect(res.status).toBe(200);
    const body = JSON.parse(await res.text());
    expect(body.sessions).toHaveLength(1);
    expect(body.samples_hr).toHaveLength(1);
    expect(body.samples_hr[0].hr_bpm).toBe(65);
    expect(body.samples_acc).toHaveLength(1);
    expect(body.session_metrics[0].rmssd).toBe(42);
    expect(body.label_corrections[0].corrected_label_type).toBe("trot");
    expect(body.session_signal_events[0].kind).toBe("weak");
    expect(body.horses[0].name).toBe("Comet");
  });

  it("download headers carry attachment filename", async () => {
    getUserMock.mockResolvedValueOnce({ id: USER_ID });
    db.profile = { id: USER_ID, display_name: "F" };
    const { GET } = await import("@/app/api/me/export/route");
    const res = await GET(fakeReq());
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="my-data-/);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("500 when rider_profiles fetch errors", async () => {
    getUserMock.mockResolvedValueOnce({ id: USER_ID });
    db.profileErr = { message: "db down" };
    const { GET } = await import("@/app/api/me/export/route");
    const res = await GET(fakeReq());
    expect(res.status).toBe(500);
  });
});
