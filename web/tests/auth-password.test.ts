import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  process.env.ADMIN_EMAILS = "ferdinand.straehuber@gmail.com";
});

const signInWithPassword = vi.fn();
const signUp = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { signInWithPassword, signUp },
  }),
  getUser: async () => null,
}));

afterEach(() => {
  vi.clearAllMocks();
});

function fakeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

describe("POST /api/auth/password", () => {
  it("400s when body is missing fields", async () => {
    const { POST } = await import("@/app/api/auth/password/route");
    const res = await POST(fakeReq({ email: "not-an-email", password: "x" }));
    expect(res.status).toBe(400);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("normalises email and returns ok=signin on valid credentials", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: { session: { access_token: "t" } },
      error: null,
    });
    const { POST } = await import("@/app/api/auth/password/route");

    const res = await POST(
      fakeReq({ email: "Anna@Example.COM", password: "secret123" }),
    );

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "anna@example.com",
      password: "secret123",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, mode: "signin" });
  });

  it("returns 401 invalid_credentials when sign-in fails (admin-managed onboarding — no signup fallback)", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { code: "invalid_credentials", status: 400 },
    });
    const { POST } = await import("@/app/api/auth/password/route");

    const res = await POST(
      fakeReq({ email: "stranger@example.com", password: "secret123" }),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_credentials" });
    // Critical: signUp must NOT be called. V0 has no self-serve onboarding.
    expect(signUp).not.toHaveBeenCalled();
  });

  it("returns 401 invalid_credentials when sign-in returns no session (defensive)", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });
    const { POST } = await import("@/app/api/auth/password/route");

    const res = await POST(
      fakeReq({ email: "stranger@example.com", password: "secret123" }),
    );

    expect(res.status).toBe(401);
    expect(signUp).not.toHaveBeenCalled();
  });
});
