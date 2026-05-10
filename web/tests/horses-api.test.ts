import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  process.env.ADMIN_EMAILS = "ferdinand.straehuber@gmail.com";
});

const rpcSpy = vi.fn<(...args: unknown[]) => void>();
const getUserMock = vi.fn();

const HORSE_ID = "22222222-2222-4222-8222-222222222222";
const RIDER_ID = "44444444-4444-4444-8444-444444444444";

type RpcReturn = {
  data: { id: string; name: string }[] | null;
  error: { code?: string; message?: string } | null;
};

let rpcReturn: RpcReturn = {
  data: [{ id: HORSE_ID, name: "Hippo" }],
  error: null,
};

function buildClient() {
  return {
    auth: {},
    rpc: (fn: string, args: unknown) => {
      rpcSpy(fn, args);
      return Promise.resolve(rpcReturn);
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
  rpcSpy.mockReset();
  rpcReturn = {
    data: [{ id: HORSE_ID, name: "Hippo" }],
    error: null,
  };
});

function fakeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

describe("POST /api/horses", () => {
  it("returns 401 when no user", async () => {
    getUserMock.mockReturnValueOnce(null);
    const { POST } = await import("@/app/api/horses/route");
    const res = await POST(fakeReq({ name: "Hippo" }));
    expect(res.status).toBe(401);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it("returns 400 when name is missing", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/horses/route");
    const res = await POST(fakeReq({}));
    expect(res.status).toBe(400);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it("returns 400 when name is empty string", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/horses/route");
    const res = await POST(fakeReq({ name: "" }));
    expect(res.status).toBe(400);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it("returns 400 when name is whitespace-only", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/horses/route");
    const res = await POST(fakeReq({ name: "   " }));
    expect(res.status).toBe(400);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it("returns 400 when name is longer than 80 chars", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/horses/route");
    const res = await POST(fakeReq({ name: "x".repeat(81) }));
    expect(res.status).toBe(400);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it("returns 200 with {id, name} on RPC success and trims input before sending", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/horses/route");
    const res = await POST(fakeReq({ name: "  Hippo  " }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { id: string; name: string };
    expect(json).toEqual({ id: HORSE_ID, name: "Hippo" });
    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy.mock.calls[0][0]).toBe("create_horse_for_self");
    expect(rpcSpy.mock.calls[0][1]).toEqual({ p_name: "Hippo" });
  });

  it("returns 401 when RPC raises 'unauthorized' (42501)", async () => {
    rpcReturn = { data: null, error: { code: "42501", message: "unauthorized" } };
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/horses/route");
    const res = await POST(fakeReq({ name: "Hippo" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when RPC raises 'invalid_name' (22023)", async () => {
    rpcReturn = { data: null, error: { code: "22023", message: "invalid_name" } };
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/horses/route");
    const res = await POST(fakeReq({ name: "Hippo" }));
    expect(res.status).toBe(400);
  });

  it("returns 409 when rider_profiles row missing (23503)", async () => {
    rpcReturn = { data: null, error: { code: "23503", message: "no_rider_profile" } };
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/horses/route");
    const res = await POST(fakeReq({ name: "Hippo" }));
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("no_rider_profile");
  });

  it("returns 500 on unexpected RPC failure", async () => {
    rpcReturn = { data: null, error: { code: "XX000", message: "boom" } };
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/horses/route");
    const res = await POST(fakeReq({ name: "Hippo" }));
    expect(res.status).toBe(500);
  });

  it("returns 500 when RPC returns empty data array", async () => {
    rpcReturn = { data: [], error: null };
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/horses/route");
    const res = await POST(fakeReq({ name: "Hippo" }));
    expect(res.status).toBe(500);
  });
});
