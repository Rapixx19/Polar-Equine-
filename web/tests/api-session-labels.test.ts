import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
});

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const RIDER_ID = "44444444-4444-4444-8444-444444444444";

type SessionRow = {
  id: string;
  created_at: string;
  status: "active" | "completed" | "abandoned" | "approved";
  rider_id: string;
};

type DbState = {
  sessionRow: SessionRow | null;
  insertReturn: { data: Array<{ id: string }> | null; error: { code?: string; message?: string } | null };
  updateReturn: { data: Array<{ id: string }> | null; error: { code?: string; message?: string } | null };
};

const insertSpy = vi.fn<(rows: unknown) => void>();
const updateSpy = vi.fn<(patch: unknown) => void>();
const getUserMock = vi.fn();

const db: DbState = {
  sessionRow: null,
  insertReturn: { data: [{ id: "c1" }], error: null },
  updateReturn: { data: [{ id: SESSION_ID }], error: null },
};

function buildClient() {
  return {
    auth: {},
    from: vi.fn((table: string) => {
      if (table === "sessions") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: db.sessionRow, error: null }),
            }),
          }),
          update: (patch: unknown) => {
            updateSpy(patch);
            return {
              eq: () => ({
                eq: () => ({
                  select: async () => db.updateReturn,
                }),
              }),
            };
          },
        };
      }
      if (table === "label_corrections") {
        return {
          insert: (rows: unknown) => {
            insertSpy(rows);
            return {
              select: async () => db.insertReturn,
            };
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
  db.sessionRow = null;
  db.insertReturn = { data: [{ id: "c1" }], error: null };
  db.updateReturn = { data: [{ id: SESSION_ID }], error: null };
});

function fakeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

const validBlocks = [
  { start_ms: 0, end_ms: 600_000, auto_label: "walk", corrected_label: "walk", jump_count: 0 },
  { start_ms: 600_000, end_ms: 1_200_000, auto_label: "trot", corrected_label: "canter", jump_count: 2 },
];
const validBody = { algo_version: "hr-threshold-v0.1", blocks: validBlocks };
const nowIso = () => new Date().toISOString();

describe("POST /api/sessions/[id]/labels", () => {
  it("returns 401 when unauthenticated", async () => {
    getUserMock.mockReturnValueOnce(null);
    const { POST } = await import("@/app/api/sessions/[id]/labels/route");
    const res = await POST(fakeReq(validBody), ctx(SESSION_ID));
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid session id", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/sessions/[id]/labels/route");
    const res = await POST(fakeReq(validBody), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when blocks is empty", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/sessions/[id]/labels/route");
    const res = await POST(
      fakeReq({ algo_version: "hr-threshold-v0.1", blocks: [] }),
      ctx(SESSION_ID),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when a block has an invalid label", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/sessions/[id]/labels/route");
    const res = await POST(
      fakeReq({
        algo_version: "hr-threshold-v0.1",
        blocks: [{ start_ms: 0, end_ms: 1000, auto_label: "walk", corrected_label: "gallop", jump_count: 0 }],
      }),
      ctx(SESSION_ID),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when algo_version is missing", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/sessions/[id]/labels/route");
    const res = await POST(fakeReq({ blocks: validBlocks }), ctx(SESSION_ID));
    expect(res.status).toBe(400);
  });

  it("returns 404 when session not owned / not found (RLS-filtered)", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    db.sessionRow = null;
    const { POST } = await import("@/app/api/sessions/[id]/labels/route");
    const res = await POST(fakeReq(validBody), ctx(SESSION_ID));
    expect(res.status).toBe(404);
  });

  it("returns 409 when status is not 'completed'", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    db.sessionRow = {
      id: SESSION_ID,
      created_at: nowIso(),
      status: "approved",
      rider_id: RIDER_ID,
    };
    const { POST } = await import("@/app/api/sessions/[id]/labels/route");
    const res = await POST(fakeReq(validBody), ctx(SESSION_ID));
    expect(res.status).toBe(409);
  });

  it("returns 410 when outside 24h edit window", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const longAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    db.sessionRow = {
      id: SESSION_ID,
      created_at: longAgo,
      status: "completed",
      rider_id: RIDER_ID,
    };
    const { POST } = await import("@/app/api/sessions/[id]/labels/route");
    const res = await POST(fakeReq(validBody), ctx(SESSION_ID));
    expect(res.status).toBe(410);
  });

  it("inserts label rows and flips status on happy path", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    db.sessionRow = {
      id: SESSION_ID,
      created_at: nowIso(),
      status: "completed",
      rider_id: RIDER_ID,
    };
    db.insertReturn = { data: [{ id: "c1" }, { id: "c2" }], error: null };

    const { POST } = await import("@/app/api/sessions/[id]/labels/route");
    const res = await POST(fakeReq(validBody), ctx(SESSION_ID));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; inserted: number };
    expect(json.ok).toBe(true);
    expect(json.inserted).toBe(2);

    expect(insertSpy).toHaveBeenCalledTimes(1);
    const rows = insertSpy.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0].session_id).toBe(SESSION_ID);
    expect(rows[0].rider_id).toBe(RIDER_ID);
    expect(rows[0].algo_version).toBe("hr-threshold-v0.1");
    expect(rows[0].auto_jump_count).toBe(0);
    // Unchanged block — auto and corrected match, kind = 'approved'.
    expect(rows[0].correction_kind).toBe("approved");
    expect(rows[0].auto_label_type).toBe("walk");
    expect(rows[0].corrected_label_type).toBe("walk");
    // Second block was relabelled trot → canter, jump_count moved to 2.
    expect(rows[1].correction_kind).toBe("relabelled");
    expect(rows[1].auto_label_type).toBe("trot");
    expect(rows[1].corrected_label_type).toBe("canter");
    expect(rows[1].corrected_jump_count).toBe(2);

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const patch = updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.status).toBe("approved");
    expect(typeof patch.updated_at).toBe("string");
  });

  it("returns 409 when RLS denies insert (status raced)", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    db.sessionRow = {
      id: SESSION_ID,
      created_at: nowIso(),
      status: "completed",
      rider_id: RIDER_ID,
    };
    db.insertReturn = { data: null, error: { code: "42501", message: "rls" } };

    const { POST } = await import("@/app/api/sessions/[id]/labels/route");
    const res = await POST(fakeReq(validBody), ctx(SESSION_ID));
    expect(res.status).toBe(409);
  });

  it("returns 500 when insert fails for unexpected reason", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    db.sessionRow = {
      id: SESSION_ID,
      created_at: nowIso(),
      status: "completed",
      rider_id: RIDER_ID,
    };
    db.insertReturn = { data: null, error: { code: "23502", message: "not null" } };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { POST } = await import("@/app/api/sessions/[id]/labels/route");
    const res = await POST(fakeReq(validBody), ctx(SESSION_ID));
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });

  it("returns 500 when the status flip update returns no rows", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    db.sessionRow = {
      id: SESSION_ID,
      created_at: nowIso(),
      status: "completed",
      rider_id: RIDER_ID,
    };
    db.updateReturn = { data: [], error: null };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { POST } = await import("@/app/api/sessions/[id]/labels/route");
    const res = await POST(fakeReq(validBody), ctx(SESSION_ID));
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });
});
