import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  process.env.ADMIN_EMAILS = "ferdinand.straehuber@gmail.com";
});

const signInWithOtp = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { signInWithOtp },
  }),
  getUser: async () => null,
}));

afterEach(() => {
  vi.clearAllMocks();
});

function fakeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

describe("POST /api/auth/magic-link", () => {
  it("400s when body is missing required fields", async () => {
    const { POST } = await import("@/app/api/auth/magic-link/route");
    const res = await POST(fakeReq({ email: "not-an-email", consented: true }));
    expect(res.status).toBe(400);
  });

  it("400s when consent is missing", async () => {
    const { POST } = await import("@/app/api/auth/magic-link/route");
    const res = await POST(fakeReq({ email: "valid@example.com" }));
    expect(res.status).toBe(400);
  });

  it("calls signInWithOtp with the right redirect and returns sent:true", async () => {
    signInWithOtp.mockResolvedValueOnce({ error: null });
    const { POST } = await import("@/app/api/auth/magic-link/route");

    const res = await POST(fakeReq({ email: "Anna@Example.COM", consented: true }));

    expect(signInWithOtp).toHaveBeenCalledTimes(1);
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "anna@example.com",
      options: { emailRedirectTo: "https://app.test/auth/callback" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true });
  });

  it("returns 500 when supabase throws", async () => {
    signInWithOtp.mockResolvedValueOnce({ error: { code: "rate_limited", status: 429 } });
    const { POST } = await import("@/app/api/auth/magic-link/route");

    const res = await POST(fakeReq({ email: "x@y.dev", consented: true }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "send_failed" });
  });
});
