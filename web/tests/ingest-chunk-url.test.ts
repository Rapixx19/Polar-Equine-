import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  process.env.ADMIN_EMAILS = "ferdinand.straehuber@gmail.com";
});

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const RIDER_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_RIDER_ID = "55555555-5555-4555-8555-555555555555";

type SessionRow = { id: string; status: string; rider_id: string } | null;
type SignedUrlReturn = {
  data: { signedUrl: string; token: string; path: string } | null;
  error: { message: string } | null;
};

const getUserMock = vi.fn();
const createSignedUploadUrlSpy = vi.fn<(...args: unknown[]) => unknown>();

let sessionRow: SessionRow = { id: SESSION_ID, status: "active", rider_id: RIDER_ID };
let signedReturn: SignedUrlReturn = {
  data: { signedUrl: "https://storage.test/upload/abc", token: "tok", path: "x/acc/000000.bin" },
  error: null,
};

function buildServerClient() {
  return {
    auth: {},
    from: vi.fn((table: string) => {
      if (table === "sessions") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: sessionRow, error: null }),
            }),
          }),
        };
      }
      return {};
    }),
  };
}

function buildServiceClient() {
  return {
    storage: {
      from: vi.fn(() => ({
        createSignedUploadUrl: (path: string) => {
          createSignedUploadUrlSpy(path);
          return Promise.resolve(signedReturn);
        },
      })),
    },
  };
}

vi.mock("@/lib/auth/server", () => ({
  createServerSupabaseClient: async () => buildServerClient(),
  getUser: async () => getUserMock(),
}));

vi.mock("@/lib/auth/service-role", () => ({
  createServiceRoleClient: () => buildServiceClient(),
}));

afterEach(() => {
  vi.clearAllMocks();
  getUserMock.mockReset();
  sessionRow = { id: SESSION_ID, status: "active", rider_id: RIDER_ID };
  signedReturn = {
    data: { signedUrl: "https://storage.test/upload/abc", token: "tok", path: "x/acc/000000.bin" },
    error: null,
  };
});

function fakeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}
function badJsonReq(): NextRequest {
  return { json: async () => { throw new Error("bad json"); } } as unknown as NextRequest;
}

const validBody = { session_id: SESSION_ID, stream: "acc", chunk_index: 0 };

describe("POST /api/ingest/chunk-url", () => {
  it("returns 401 when no user", async () => {
    getUserMock.mockReturnValueOnce(null);
    const { POST } = await import("@/app/api/ingest/chunk-url/route");
    const res = await POST(fakeReq(validBody));
    expect(res.status).toBe(401);
    expect(createSignedUploadUrlSpy).not.toHaveBeenCalled();
  });

  it("returns 400 on malformed JSON", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/chunk-url/route");
    const res = await POST(badJsonReq());
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid stream value", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/chunk-url/route");
    const res = await POST(fakeReq({ session_id: SESSION_ID, stream: "hr", chunk_index: 0 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on negative chunk_index", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/chunk-url/route");
    const res = await POST(fakeReq({ session_id: SESSION_ID, stream: "acc", chunk_index: -1 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on non-uuid session_id", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/chunk-url/route");
    const res = await POST(fakeReq({ session_id: "not-a-uuid", stream: "acc", chunk_index: 0 }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when session does not exist", async () => {
    sessionRow = null;
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/chunk-url/route");
    const res = await POST(fakeReq(validBody));
    expect(res.status).toBe(404);
    expect(createSignedUploadUrlSpy).not.toHaveBeenCalled();
  });

  it("returns 403 when session belongs to another rider", async () => {
    sessionRow = { id: SESSION_ID, status: "active", rider_id: OTHER_RIDER_ID };
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/chunk-url/route");
    const res = await POST(fakeReq(validBody));
    expect(res.status).toBe(403);
    expect(createSignedUploadUrlSpy).not.toHaveBeenCalled();
  });

  it("returns 409 when session is not active", async () => {
    sessionRow = { id: SESSION_ID, status: "completed", rider_id: RIDER_ID };
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/chunk-url/route");
    const res = await POST(fakeReq(validBody));
    expect(res.status).toBe(409);
    expect(createSignedUploadUrlSpy).not.toHaveBeenCalled();
  });

  it("happy path: returns url + token + storage_path with padded chunk index", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/chunk-url/route");
    const res = await POST(fakeReq({ session_id: SESSION_ID, stream: "acc", chunk_index: 42 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { url: string; token: string; storage_path: string };
    expect(json.url).toBe("https://storage.test/upload/abc");
    expect(json.token).toBe("tok");
    expect(json.storage_path).toBe(`${SESSION_ID}/acc/000042.bin`);
    expect(createSignedUploadUrlSpy).toHaveBeenCalledWith(`${SESSION_ID}/acc/000042.bin`);
  });

  it("returns 500 when the Storage signed URL call errors out", async () => {
    signedReturn = { data: null, error: { message: "boom" } };
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/chunk-url/route");
    const res = await POST(fakeReq(validBody));
    expect(res.status).toBe(500);
  });

  it("ECG stream is accepted and reflected in the storage_path", async () => {
    getUserMock.mockReturnValueOnce({ id: RIDER_ID, email: "a@b.dev" });
    const { POST } = await import("@/app/api/ingest/chunk-url/route");
    const res = await POST(fakeReq({ session_id: SESSION_ID, stream: "ecg", chunk_index: 7 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { storage_path: string };
    expect(json.storage_path).toBe(`${SESSION_ID}/ecg/000007.bin`);
  });
});
