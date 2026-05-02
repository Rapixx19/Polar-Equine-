import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.ALGO_BASE_URL = "http://algo.test";
  process.env.ALGO_BEARER_TOKEN = "test-token";
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function callSmoke(): Promise<Response> {
  const mod = await import("@/app/api/smoke/route");
  return mod.GET();
}

describe("/api/smoke", () => {
  it("returns 200 and forwards algo body when algo responds 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(url).toBe("http://algo.test/health");
        const headers = new Headers(init?.headers);
        expect(headers.get("authorization")).toBe("Bearer test-token");
        return new Response(JSON.stringify({ status: "ok", algo_version: "0.1.0" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const res = await callSmoke();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, algo: { status: "ok", algo_version: "0.1.0" } });
  });

  it("returns 502 when algo responds non-200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 401 })),
    );

    const res = await callSmoke();
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({ ok: false, where: "algo", status: 401 });
  });
});
