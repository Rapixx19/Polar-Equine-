import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
});

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    // Mirror Next's behaviour: redirect() throws so callers never proceed.
    throw new Error(`__redirect__:${path}`);
  }),
}));

const authGetUser = vi.fn();
let profileRow: { id: string; display_name: string | null; is_admin: boolean } | null = null;

function buildClient() {
  return {
    auth: {
      getUser: async () => authGetUser(),
    },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: profileRow, error: null }),
        }),
      }),
    })),
  };
}

afterEach(() => {
  vi.clearAllMocks();
  authGetUser.mockReset();
  profileRow = null;
});

describe("assertAdmin", () => {
  it("redirects to / when no user", async () => {
    authGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const { assertAdmin } = await import("@/lib/auth/server");
    const supabase = buildClient();

    await expect(assertAdmin(supabase as never)).rejects.toThrow("__redirect__:/");
  });

  it("redirects to /auth/provision when user has no profile row", async () => {
    authGetUser.mockResolvedValueOnce({
      data: { user: { id: "u1", email: "a@b.dev" } },
      error: null,
    });
    profileRow = null;
    const { assertAdmin } = await import("@/lib/auth/server");
    const supabase = buildClient();

    await expect(assertAdmin(supabase as never)).rejects.toThrow(
      "__redirect__:/auth/provision",
    );
  });

  it("redirects to /home when user exists but is not admin", async () => {
    authGetUser.mockResolvedValueOnce({
      data: { user: { id: "u1", email: "a@b.dev" } },
      error: null,
    });
    profileRow = { id: "u1", display_name: "Anna", is_admin: false };
    const { assertAdmin } = await import("@/lib/auth/server");
    const supabase = buildClient();

    await expect(assertAdmin(supabase as never)).rejects.toThrow("__redirect__:/home");
  });

  it("returns { user, profile } when user is admin", async () => {
    authGetUser.mockResolvedValueOnce({
      data: { user: { id: "admin-1", email: "ferdinand.straehuber@gmail.com" } },
      error: null,
    });
    profileRow = { id: "admin-1", display_name: "Ferdinand", is_admin: true };
    const { assertAdmin } = await import("@/lib/auth/server");
    const supabase = buildClient();

    const result = await assertAdmin(supabase as never);
    expect(result.user.id).toBe("admin-1");
    expect(result.profile.is_admin).toBe(true);
    expect(result.profile.display_name).toBe("Ferdinand");
  });

  it("returns profile with null display_name without crashing", async () => {
    authGetUser.mockResolvedValueOnce({
      data: { user: { id: "admin-2", email: "co@admin.dev" } },
      error: null,
    });
    profileRow = { id: "admin-2", display_name: null, is_admin: true };
    const { assertAdmin } = await import("@/lib/auth/server");
    const supabase = buildClient();

    const result = await assertAdmin(supabase as never);
    expect(result.profile.display_name).toBeNull();
    expect(result.profile.is_admin).toBe(true);
  });
});
