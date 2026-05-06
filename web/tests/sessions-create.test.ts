import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  process.env.ADMIN_EMAILS = "ferdinand.straehuber@gmail.com";
});

const insertSpy = vi.fn<(...args: unknown[]) => void>();
const getUserMock = vi.fn();

type ExistingRow = { id: string; start_time: string } | null;
type InsertReturn = { data: { id: string; start_time: string } | null; error: { code?: string; message?: string } | null };

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const HORSE_ID = "22222222-2222-4222-8222-222222222222";
const CLIENT_SESSION_ID = "33333333-3333-4333-8333-333333333333";
const RIDER_ID = "44444444-4444-4444-8444-444444444444";
const EXISTING_ID = "55555555-5555-4555-8555-555555555555";

let existingRow: ExistingRow = null;
let insertReturn: InsertReturn = {
  data: { id: SESSION_ID, start_time: "2026-05-02T10:00:00.000Z" },
  error: null,
};

function buildClient() {
  return {
    auth: {},
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: existingRow, error: null }),
          }),
        }),
      }),
      insert: (row: unknown) => {
        insertSpy(row);
        return {
          select: () => ({
            single: async () => insertReturn,
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
  existingRow = null;
  insertReturn = {
    data: { id: SESSION_ID, start_time: "2026-05-02T10:00:00.000Z" },
    error: null,
  };
});

function fakeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

const validBody = {
  horse_id: HORSE_ID,
  activity_type: "riding",
  client_session_id: CLIENT_SESSION_ID,
};

describe("POST /api/sessions", () => {
  it("returns 401 when no user", async () => {
    getUserMock.mockReturnValueOnce(null);
    const { POST } = await import("@/app/api/sessions/route");
    const res = await POST(fakeReq(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 on missing client_session_id", async () => {
    getUserMock.mockReturnValueOnce({ id: "u1", email: "a@b.dev" });
    const { POST } = await import("@/app/api/sessions/route");
    const res = await POST(fakeReq({ horse_id: validBody.horse_id, activity_type: "riding" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid activity_type", async () => {
    getUserMock.mockReturnValueOnce({ id: "u1", email: "a@b.dev" });
    const { POST } = await import("@/app/api/sessions/route");
    const res = await POST(fakeReq({ ...validBody, activity_type: "frob" }));
    expect(res.status).toBe(400);
  });

  it("inserts a new session on happy path", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/sessions/route");

    const res = await POST(fakeReq(validBody));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { id: string; start_time: string };
    expect(json.id).toBe(SESSION_ID);
    expect(insertSpy).toHaveBeenCalledTimes(1);

    const row = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(row.rider_id).toBe(RIDER_ID);
    expect(row.horse_id).toBe(validBody.horse_id);
    expect(row.activity_type).toBe("riding");
    expect(row.client_session_id).toBe(validBody.client_session_id);
    expect(row.status).toBe("active");
    expect(typeof row.start_time).toBe("string");
  });

  it("returns existing row (200) when client_session_id already exists for this rider", async () => {
    existingRow = { id: EXISTING_ID, start_time: "2026-05-01T09:00:00.000Z" };
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/sessions/route");

    const res = await POST(fakeReq(validBody));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { id: string; start_time: string };
    expect(json.id).toBe(EXISTING_ID);
    expect(json.start_time).toBe("2026-05-01T09:00:00.000Z");
    // Marquee assertion: idempotency means insert was NEVER called.
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("returns 403 when RLS denies the insert", async () => {
    insertReturn = { data: null, error: { code: "42501", message: "rls" } };
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/sessions/route");

    const res = await POST(fakeReq(validBody));
    expect(res.status).toBe(403);
  });

  it("forwards riding_subtype into the insert row when activity_type='riding'", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/sessions/route");

    const res = await POST(
      fakeReq({ ...validBody, riding_subtype: "heavy_jumping" }),
    );
    expect(res.status).toBe(200);
    const row = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(row.riding_subtype).toBe("heavy_jumping");
    expect(row.activity_note).toBeNull();
  });

  it("forwards activity_note into the insert row when activity_type='other'", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/sessions/route");

    const res = await POST(
      fakeReq({
        horse_id: HORSE_ID,
        activity_type: "other",
        client_session_id: CLIENT_SESSION_ID,
        activity_note: "Polo match — practice game",
      }),
    );
    expect(res.status).toBe(200);
    const row = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(row.activity_type).toBe("other");
    expect(row.activity_note).toBe("Polo match — practice game");
    expect(row.riding_subtype).toBeNull();
  });

  it("returns 409 when another rider already has this horse active", async () => {
    insertReturn = {
      data: null,
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "sessions_one_active_per_horse_idx"',
      },
    };
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/sessions/route");

    const res = await POST(fakeReq(validBody));
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("horse_already_active");
  });
});
