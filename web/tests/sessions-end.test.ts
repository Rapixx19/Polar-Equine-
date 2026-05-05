import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  process.env.ADMIN_EMAILS = "ferdinand.straehuber@gmail.com";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});

const enqueueInsertSpy = vi.fn<(...args: unknown[]) => void>();
let enqueueError: { code?: string; message?: string } | null = null;
vi.mock("@/lib/auth/service-role", () => ({
  createServiceRoleClient: () => ({
    from: vi.fn(() => ({
      insert: (payload: unknown) => {
        enqueueInsertSpy(payload);
        return Promise.resolve({ error: enqueueError });
      },
    })),
  }),
}));

const updateSpy = vi.fn<(...args: unknown[]) => void>();
const getUserMock = vi.fn();

type StatusRow = { status: string } | null;
type UpdateReturn = { data: Array<{ id: string }> | null; error: { code?: string; message?: string } | null };

let currentStatusRow: StatusRow = { status: "active" };
let updateReturn: UpdateReturn = {
  data: [{ id: "11111111-1111-4111-8111-111111111111" }],
  error: null,
};

function buildClient() {
  return {
    auth: {},
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: currentStatusRow, error: null }),
        }),
      }),
      update: (patch: unknown) => {
        updateSpy(patch);
        return {
          eq: () => ({
            select: () => Promise.resolve(updateReturn),
          }),
        };
      },
    })),
  };
}

vi.mock("@/lib/auth/server", () => ({
  createServerSupabaseClient: async () => buildClient(),
  getUser: async () => getUserMock(),
}));

afterEach(() => {
  vi.clearAllMocks();
  getUserMock.mockReset();
  enqueueInsertSpy.mockReset();
  enqueueError = null;
  currentStatusRow = { status: "active" };
  updateReturn = {
    data: [{ id: "11111111-1111-4111-8111-111111111111" }],
    error: null,
  };
});

function fakeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

const ctx = {
  params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }),
};

describe("PATCH /api/sessions/[id]", () => {
  it("returns 400 on invalid id", async () => {
    getUserMock.mockReturnValueOnce({ id: "u1", email: "a@b.dev" });
    const { PATCH } = await import("@/app/api/sessions/[id]/route");
    const res = await PATCH(fakeReq({ action: "end" }), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 401 when no user", async () => {
    getUserMock.mockReturnValueOnce(null);
    const { PATCH } = await import("@/app/api/sessions/[id]/route");
    const res = await PATCH(fakeReq({ action: "end" }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 400 on bad action", async () => {
    getUserMock.mockReturnValueOnce({ id: "u1", email: "a@b.dev" });
    const { PATCH } = await import("@/app/api/sessions/[id]/route");
    const res = await PATCH(fakeReq({ action: "frob" }), ctx);
    expect(res.status).toBe(400);
  });

  it("ends an active session and enqueues a compute job", async () => {
    getUserMock.mockReturnValueOnce({ id: "u1", email: "a@b.dev" });
    const { PATCH } = await import("@/app/api/sessions/[id]/route");

    const res = await PATCH(fakeReq({ action: "end" }), ctx);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; enqueued: boolean };
    expect(json.enqueued).toBe(true);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const patch = updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.status).toBe("completed");
    expect(typeof patch.end_time).toBe("string");
    expect(typeof patch.updated_at).toBe("string");
    expect(enqueueInsertSpy).toHaveBeenCalledTimes(1);
    const enqueuePayload = enqueueInsertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(enqueuePayload.session_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(enqueuePayload.job_type).toBe("compute");
    expect(enqueuePayload.status).toBe("queued");
  });

  it("returns enqueued=false when the compute_jobs insert fails", async () => {
    enqueueError = { code: "23505", message: "duplicate key" };
    getUserMock.mockReturnValueOnce({ id: "u1", email: "a@b.dev" });
    const { PATCH } = await import("@/app/api/sessions/[id]/route");
    const res = await PATCH(fakeReq({ action: "end" }), ctx);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; enqueued: boolean };
    expect(json.enqueued).toBe(false);
  });

  it("returns 404 when row not found", async () => {
    currentStatusRow = null;
    getUserMock.mockReturnValueOnce({ id: "u1", email: "a@b.dev" });
    const { PATCH } = await import("@/app/api/sessions/[id]/route");
    const res = await PATCH(fakeReq({ action: "end" }), ctx);
    expect(res.status).toBe(404);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("returns 409 when already completed (no enqueue)", async () => {
    currentStatusRow = { status: "completed" };
    getUserMock.mockReturnValueOnce({ id: "u1", email: "a@b.dev" });
    const { PATCH } = await import("@/app/api/sessions/[id]/route");
    const res = await PATCH(fakeReq({ action: "end" }), ctx);
    expect(res.status).toBe(409);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(enqueueInsertSpy).not.toHaveBeenCalled();
  });

  it("updates notes-only without ending", async () => {
    getUserMock.mockReturnValueOnce({ id: "u1", email: "a@b.dev" });
    const { PATCH } = await import("@/app/api/sessions/[id]/route");
    const res = await PATCH(fakeReq({ notes: "good ride" }), ctx);
    expect(res.status).toBe(200);
    const patch = updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.notes).toBe("good ride");
    expect(patch.status).toBeUndefined();
    expect(patch.end_time).toBeUndefined();
  });
});
