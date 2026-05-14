import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.ANTHROPIC_API_KEY = "test-key";
});

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";

const getUserMock = vi.fn();
const generateInsightMock = vi.fn();
const upsertSpy = vi.fn();

const db = {
  isAdmin: true as boolean,
  existing: null as Record<string, unknown> | null,
  session: null as Record<string, unknown> | null,
  metrics: null as Record<string, unknown> | null,
  labels: [] as Array<Record<string, unknown>>,
};

function buildClient() {
  const stub = (data: unknown) => {
    const result = { data, error: null };
    const thenable = {
      maybeSingle: async () => result,
      then: (resolve: (v: typeof result) => unknown) => resolve(result),
    };
    return { select: () => ({ eq: () => thenable }) };
  };
  return {
    auth: {},
    from: (table: string) => {
      if (table === "rider_profiles") return stub({ is_admin: db.isAdmin });
      if (table === "sessions") return stub(db.session);
      if (table === "session_metrics") return stub(db.metrics);
      if (table === "label_corrections") return stub(db.labels);
      if (table === "session_insights") {
        return {
          ...stub(db.existing),
          upsert: (row: Record<string, unknown>) => {
            upsertSpy(row);
            return {
              select: () => ({
                maybeSingle: async () => ({
                  data: { generated_at: "2026-05-13T11:00:00Z" },
                  error: null,
                }),
              }),
            };
          },
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
vi.mock("@/lib/insights/anthropic-client", () => ({
  generateInsight: (prompt: string) => generateInsightMock(prompt),
}));

afterEach(() => {
  vi.clearAllMocks();
  getUserMock.mockReset();
  generateInsightMock.mockReset();
  upsertSpy.mockReset();
  db.isAdmin = true;
  db.existing = null;
  db.session = null;
  db.metrics = null;
  db.labels = [];
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const fakeReq = (body: Record<string, unknown> = {}): NextRequest =>
  ({ json: async () => body }) as unknown as NextRequest;

function seed() {
  db.session = {
    id: SESSION_ID,
    activity_type: "riding",
    start_time: "2026-05-13T10:00:00.000Z",
    end_time: "2026-05-13T10:30:00.000Z",
  };
  db.metrics = { hr_avg: 80, hr_peak: 150, rmssd_ms: 35, algo_version: "0.3.1" };
}

const cachedRow = {
  insight_markdown: "cached",
  model: "claude-sonnet-4-6",
  prompt_version: "v1",
  input_token_count: 100,
  output_token_count: 50,
  generated_at: "2026-05-13T09:00:00Z",
};

describe("POST /api/admin/sessions/[id]/insights", () => {
  it("returns 401 when unauthenticated", async () => {
    getUserMock.mockReturnValueOnce(null);
    const { POST } = await import("@/app/api/admin/sessions/[id]/insights/route");
    expect((await POST(fakeReq(), ctx(SESSION_ID))).status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    getUserMock.mockReturnValueOnce({ id: ADMIN_ID });
    db.isAdmin = false;
    const { POST } = await import("@/app/api/admin/sessions/[id]/insights/route");
    expect((await POST(fakeReq(), ctx(SESSION_ID))).status).toBe(403);
  });

  it("returns cached insight without calling generateInsight", async () => {
    getUserMock.mockReturnValueOnce({ id: ADMIN_ID });
    db.existing = cachedRow;
    const { POST } = await import("@/app/api/admin/sessions/[id]/insights/route");
    const res = await POST(fakeReq(), ctx(SESSION_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cached).toBe(true);
    expect(body.markdown).toBe("cached");
    expect(generateInsightMock).not.toHaveBeenCalled();
  });

  it("generates fresh insight when none cached and upserts", async () => {
    getUserMock.mockReturnValueOnce({ id: ADMIN_ID });
    seed();
    generateInsightMock.mockResolvedValueOnce({
      markdown: "new", input_tokens: 200, output_tokens: 80,
    });
    const { POST } = await import("@/app/api/admin/sessions/[id]/insights/route");
    const res = await POST(fakeReq(), ctx(SESSION_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cached).toBe(false);
    expect(body.markdown).toBe("new");
    expect(generateInsightMock).toHaveBeenCalledOnce();
    expect(upsertSpy.mock.calls[0][0]).toMatchObject({
      session_id: SESSION_ID, insight_markdown: "new", input_token_count: 200,
    });
  });

  it("regenerates and overwrites when regenerate=true", async () => {
    getUserMock.mockReturnValueOnce({ id: ADMIN_ID });
    seed();
    db.existing = cachedRow;
    generateInsightMock.mockResolvedValueOnce({
      markdown: "fresh", input_tokens: 210, output_tokens: 90,
    });
    const { POST } = await import("@/app/api/admin/sessions/[id]/insights/route");
    const res = await POST(fakeReq({ regenerate: true }), ctx(SESSION_ID));
    expect((await res.json()).markdown).toBe("fresh");
    expect(generateInsightMock).toHaveBeenCalledOnce();
  });

  it("returns 502 when generateInsight throws and does not upsert", async () => {
    getUserMock.mockReturnValueOnce({ id: ADMIN_ID });
    seed();
    generateInsightMock.mockRejectedValueOnce(new Error("anthropic_down"));
    const { POST } = await import("@/app/api/admin/sessions/[id]/insights/route");
    const res = await POST(fakeReq(), ctx(SESSION_ID));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("insight_generation_failed");
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});
