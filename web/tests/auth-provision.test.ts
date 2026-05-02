import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  process.env.ADMIN_EMAILS = "ferdinand.straehuber@gmail.com,co-admin@example.com";
});

const upsert = vi.fn<(...args: unknown[]) => void>();
const getUserMock = vi.fn();

function buildClient() {
  // Build a minimal supabase-shaped object for the route handler.
  return {
    auth: {},
    from: vi.fn(() => ({
      upsert: (...args: unknown[]) => {
        upsert(...args);
        return {
          select: () => ({
            single: async () => ({
              data: {
                id: "00000000-0000-0000-0000-000000000001",
                display_name: "Test Rider",
                is_admin: false,
                consented_at: "2026-05-02T00:00:00.000Z",
              },
              error: null,
            }),
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
});

function fakeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

describe("POST /api/auth/provision-rider", () => {
  it("returns 401 when no user", async () => {
    getUserMock.mockReturnValueOnce(null);
    const { POST } = await import("@/app/api/auth/provision-rider/route");
    const res = await POST(fakeReq({ display_name: "Test" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on bad body", async () => {
    getUserMock.mockReturnValueOnce({ id: "u1", email: "x@y.dev" });
    const { POST } = await import("@/app/api/auth/provision-rider/route");
    const res = await POST(fakeReq({ display_name: "" }));
    expect(res.status).toBe(400);
  });

  it("upserts with is_admin=true when email is in ADMIN_EMAILS", async () => {
    getUserMock.mockReturnValueOnce({
      id: "00000000-0000-0000-0000-000000000001",
      email: "Ferdinand.Straehuber@gmail.com",
    });
    const { POST } = await import("@/app/api/auth/provision-rider/route");

    const res = await POST(fakeReq({ display_name: "  Ferdinand  " }));

    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledTimes(1);
    const payload = upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.id).toBe("00000000-0000-0000-0000-000000000001");
    expect(payload.display_name).toBe("Ferdinand");
    expect(payload.is_admin).toBe(true);
    expect(typeof payload.consented_at).toBe("string");
    expect(Number.isFinite(Date.parse(payload.consented_at as string))).toBe(true);
  });

  it("upserts with is_admin=false for non-admin emails", async () => {
    getUserMock.mockReturnValueOnce({
      id: "u2",
      email: "rider@stable.example",
    });
    const { POST } = await import("@/app/api/auth/provision-rider/route");

    await POST(fakeReq({ display_name: "Anna" }));
    const payload = upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.is_admin).toBe(false);
  });
});
