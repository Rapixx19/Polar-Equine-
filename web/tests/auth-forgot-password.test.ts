import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  process.env.ADMIN_EMAILS = "ferdinand.straehuber@gmail.com";
});

const resetPasswordForEmail = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { resetPasswordForEmail },
  }),
  getUser: async () => null,
}));

afterEach(() => {
  vi.clearAllMocks();
});

function fakeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

describe("POST /api/auth/forgot-password", () => {
  it("400s on invalid email", async () => {
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    const res = await POST(fakeReq({ email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("forwards a normalised email and the callback redirect, returns 200", async () => {
    resetPasswordForEmail.mockResolvedValueOnce({ error: null });
    const { POST } = await import("@/app/api/auth/forgot-password/route");

    const res = await POST(fakeReq({ email: "Anna@Example.COM" }));

    expect(resetPasswordForEmail).toHaveBeenCalledWith("anna@example.com", {
      redirectTo: "https://app.test/auth/callback?next=/auth/reset",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 200 even when supabase errors (no email enumeration)", async () => {
    resetPasswordForEmail.mockResolvedValueOnce({
      error: { code: "rate_limited", status: 429 },
    });
    const { POST } = await import("@/app/api/auth/forgot-password/route");

    const res = await POST(fakeReq({ email: "x@y.dev" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
