// Chunked-binary flush lifecycle: 30s timer cadence, three-step upload
// (chunk-url → PUT → chunk-commit), one-retry policy, drop semantics, and
// drain-on-stop. Mirrors HRBatcher's tests but for raw binary blobs.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SignalBatcher } from "@/lib/ble/signal-batcher";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const SIGNED_URL = "https://storage.test.supabase.co/upload/abc";

type FetchCall = { input: RequestInfo | URL; init?: RequestInit };

let fetchMock: ReturnType<typeof vi.fn>;
let calls: FetchCall[];
let onUploaded: ReturnType<typeof vi.fn> & ((bytes: number, chunkIndex: number) => void);
let onDropped: ReturnType<typeof vi.fn> & ((bytes: number, reason: string) => void);

// Default happy-path responder: signed URL → 200, PUT → 200, commit → 200.
function defaultResponder(input: RequestInfo | URL): Response {
  const url = typeof input === "string" ? input : input.toString();
  if (url.endsWith("/api/ingest/chunk-url")) {
    return new Response(
      JSON.stringify({ url: SIGNED_URL, token: "tok", storage_path: "x/acc/000000.bin" }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  if (url === SIGNED_URL) {
    return new Response(null, { status: 200 });
  }
  if (url.endsWith("/api/ingest/chunk-commit")) {
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
  return new Response(null, { status: 500 });
}

beforeEach(() => {
  vi.useFakeTimers();
  calls = [];
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return defaultResponder(input);
  });
  vi.stubGlobal("fetch", fetchMock);
  onUploaded = vi.fn() as typeof onUploaded;
  onDropped = vi.fn() as typeof onDropped;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function makeAccBatcher() {
  return new SignalBatcher(
    SESSION_ID,
    "acc",
    { sample_rate_hz: 200, resolution_bits: 16, range_g: 8, channels: 3 },
    { onUploaded, onDropped },
  );
}

function urlsOf(): string[] {
  return calls.map(({ input }) => (typeof input === "string" ? input : input.toString()));
}

describe("SignalBatcher flush lifecycle", () => {
  it("start() + 30s tick with empty buffer → no fetch", async () => {
    const b = makeAccBatcher();
    b.start();
    await vi.advanceTimersByTimeAsync(30_000);
    await b.stop();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("samples + 30s tick → POST chunk-url, PUT bytes, POST chunk-commit", async () => {
    const b = makeAccBatcher();
    b.start();
    const samples = new Int16Array([1, 2, 3, 4, 5, 6]); // 2 XYZ triplets = 12 bytes
    b.addSamples(0, samples);
    await vi.advanceTimersByTimeAsync(30_000);
    await b.stop();

    const urls = urlsOf();
    expect(urls).toHaveLength(3);
    expect(urls[0]).toBe("/api/ingest/chunk-url");
    expect(urls[1]).toBe(SIGNED_URL);
    expect(urls[2]).toBe("/api/ingest/chunk-commit");
    expect(onUploaded).toHaveBeenCalledWith(12, 0);
    expect(onDropped).not.toHaveBeenCalled();
  });

  it("chunk-url request body includes session_id, stream, chunk_index=0 on first flush", async () => {
    const b = makeAccBatcher();
    b.addSamples(0, new Int16Array([1, 2, 3]));
    await b.stop();
    const urlReq = calls.find(
      ({ input }) => (typeof input === "string" ? input : input.toString()).endsWith("/api/ingest/chunk-url"),
    );
    expect(urlReq).toBeDefined();
    const body = JSON.parse(urlReq!.init!.body as string) as {
      session_id: string;
      stream: string;
      chunk_index: number;
    };
    expect(body).toEqual({ session_id: SESSION_ID, stream: "acc", chunk_index: 0 });
  });

  it("chunk-commit body carries timing + byte_count matching the buffered bytes", async () => {
    const b = makeAccBatcher();
    b.addSamples(0, new Int16Array([1, 2, 3])); // 6 bytes
    b.addSamples(5_000, new Int16Array([4, 5, 6])); // +6 bytes
    await b.stop();
    const commitReq = calls.find(
      ({ input }) => (typeof input === "string" ? input : input.toString()).endsWith("/api/ingest/chunk-commit"),
    );
    expect(commitReq).toBeDefined();
    const body = JSON.parse(commitReq!.init!.body as string) as {
      session_id: string;
      stream: string;
      chunk_index: number;
      start_t_ms: number;
      end_t_ms: number;
      sample_rate_hz: number;
      resolution_bits: number;
      range_g: number | null;
      channels: number;
      byte_count: number;
    };
    expect(body.session_id).toBe(SESSION_ID);
    expect(body.stream).toBe("acc");
    expect(body.chunk_index).toBe(0);
    expect(body.start_t_ms).toBe(0);
    expect(body.end_t_ms).toBe(5_000);
    expect(body.sample_rate_hz).toBe(200);
    expect(body.resolution_bits).toBe(16);
    expect(body.range_g).toBe(8);
    expect(body.channels).toBe(3);
    expect(body.byte_count).toBe(12);
  });

  it("PUT sends the raw bytes as an octet-stream", async () => {
    const b = makeAccBatcher();
    b.addSamples(0, new Int16Array([0x0102, 0x0304, 0x0506]));
    await b.stop();
    const putReq = calls.find(({ input }) => (typeof input === "string" ? input : input.toString()) === SIGNED_URL);
    expect(putReq).toBeDefined();
    expect(putReq!.init!.method).toBe("PUT");
    const headers = new Headers(putReq!.init!.headers as HeadersInit);
    expect(headers.get("content-type")).toBe("application/octet-stream");
    const bytes = putReq!.init!.body as Uint8Array;
    expect(bytes.byteLength).toBe(6);
  });

  it("retries once on chunk-url 500, then succeeds → 6 fetches total, onUploaded fires", async () => {
    fetchMock.mockReset();
    let urlAttempt = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/ingest/chunk-url")) {
        urlAttempt += 1;
        if (urlAttempt === 1) return new Response(null, { status: 500 });
      }
      return defaultResponder(input);
    });

    const b = makeAccBatcher();
    b.addSamples(0, new Int16Array([1, 2, 3]));
    await b.stop();

    // Attempt 1: chunk-url 500 → abort. Attempt 2: full 3-call cycle.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(onDropped).not.toHaveBeenCalled();
  });

  it("two consecutive chunk-url 500s → onDropped with upload_failed_after_retry", async () => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/ingest/chunk-url")) return new Response(null, { status: 500 });
      return defaultResponder(input);
    });

    const b = makeAccBatcher();
    b.addSamples(0, new Int16Array([1, 2, 3]));
    await b.stop();

    expect(onUploaded).not.toHaveBeenCalled();
    expect(onDropped).toHaveBeenCalledWith(6, "upload_failed_after_retry");
  });

  it("4xx on chunk-url → no retry, immediate drop", async () => {
    fetchMock.mockReset();
    let urlCalls = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/ingest/chunk-url")) {
        urlCalls += 1;
        return new Response(null, { status: 400 });
      }
      return defaultResponder(input);
    });

    const b = makeAccBatcher();
    b.addSamples(0, new Int16Array([1, 2, 3]));
    await b.stop();

    expect(urlCalls).toBe(1);
    expect(onUploaded).not.toHaveBeenCalled();
    expect(onDropped).toHaveBeenCalledTimes(1);
  });

  it("retries once on commit 500, then succeeds (whole 3-step cycle retried)", async () => {
    fetchMock.mockReset();
    let commitAttempt = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/ingest/chunk-commit")) {
        commitAttempt += 1;
        if (commitAttempt === 1) return new Response(null, { status: 500 });
      }
      return defaultResponder(input);
    });

    const b = makeAccBatcher();
    b.addSamples(0, new Int16Array([1, 2, 3]));
    await b.stop();

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(onUploaded).toHaveBeenCalledTimes(1);
  });

  it("network error (fetch rejects) on chunk-url is retryable", async () => {
    fetchMock.mockReset();
    let urlAttempt = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/ingest/chunk-url")) {
        urlAttempt += 1;
        if (urlAttempt === 1) throw new TypeError("network");
      }
      return defaultResponder(input);
    });

    const b = makeAccBatcher();
    b.addSamples(0, new Int16Array([1, 2, 3]));
    await b.stop();

    expect(onUploaded).toHaveBeenCalledTimes(1);
  });

  it("stop() drains the partial final chunk even when no 30s boundary has fired", async () => {
    const b = makeAccBatcher();
    b.start();
    b.addSamples(0, new Int16Array([1, 2, 3]));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchMock).not.toHaveBeenCalled();
    await b.stop();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onUploaded).toHaveBeenCalledWith(6, 0);
  });

  it("stop() with empty buffer → no fetch, no callbacks", async () => {
    const b = makeAccBatcher();
    b.start();
    await b.stop();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
    expect(onDropped).not.toHaveBeenCalled();
  });

  it("two 30s windows → chunk_index increments 0, 1", async () => {
    const b = makeAccBatcher();
    b.start();
    b.addSamples(0, new Int16Array([1, 2, 3]));
    await vi.advanceTimersByTimeAsync(30_000);
    b.addSamples(30_000, new Int16Array([4, 5, 6]));
    await vi.advanceTimersByTimeAsync(30_000);
    await b.stop();

    const commitCalls = calls.filter(
      ({ input }) => (typeof input === "string" ? input : input.toString()).endsWith("/api/ingest/chunk-commit"),
    );
    expect(commitCalls).toHaveLength(2);
    const first = JSON.parse(commitCalls[0].init!.body as string) as { chunk_index: number };
    const second = JSON.parse(commitCalls[1].init!.body as string) as { chunk_index: number };
    expect(first.chunk_index).toBe(0);
    expect(second.chunk_index).toBe(1);
  });

  it("ECG batcher passes Int32Array bytes through (4 bytes per sample, no range_g)", async () => {
    const b = new SignalBatcher(
      SESSION_ID,
      "ecg",
      { sample_rate_hz: 130, resolution_bits: 14, channels: 1 },
      { onUploaded, onDropped },
    );
    b.addSamples(0, new Int32Array([100, -200, 4096]));
    await b.stop();
    const commitReq = calls.find(
      ({ input }) => (typeof input === "string" ? input : input.toString()).endsWith("/api/ingest/chunk-commit"),
    );
    const body = JSON.parse(commitReq!.init!.body as string) as {
      stream: string;
      byte_count: number;
      range_g: number | null;
      channels: number;
    };
    expect(body.stream).toBe("ecg");
    expect(body.byte_count).toBe(12); // 3 samples × 4 bytes
    expect(body.range_g).toBeNull();
    expect(body.channels).toBe(1);
  });

  it("addSamples copies the bytes (callers may reuse the source buffer)", async () => {
    const b = makeAccBatcher();
    const src = new Int16Array([1, 2, 3]);
    b.addSamples(0, src);
    // Mutate the source after the call — must not affect uploaded bytes.
    src[0] = 999;
    src[1] = 888;
    src[2] = 777;
    await b.stop();
    const putReq = calls.find(({ input }) => (typeof input === "string" ? input : input.toString()) === SIGNED_URL);
    const bytes = putReq!.init!.body as Uint8Array;
    // little-endian int16: 1 → [01 00], 2 → [02 00], 3 → [03 00]
    expect(Array.from(bytes)).toEqual([0x01, 0x00, 0x02, 0x00, 0x03, 0x00]);
  });
});
