// Flush lifecycle: timer cadence, retry-once policy, drop semantics, and the
// stop()-during-in-flight-flush race. These are the on-call signals — getting
// the retry boundary or the drain wrong leaks samples silently.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HRBatcher } from "@/lib/ble/batcher";
import type { HRSample } from "@/lib/ble/hr-codec";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

let fetchMock: ReturnType<typeof vi.fn>;
let onFlushed: ReturnType<typeof vi.fn> & ((count: number) => void);
let onDropped: ReturnType<typeof vi.fn> & ((count: number, reason: string) => void);

function makeSample(received_at: number): HRSample {
  return { hr_bpm: 60, contact: "contact", rr_ms: [], received_at };
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  onFlushed = vi.fn() as typeof onFlushed;
  onDropped = vi.fn() as typeof onDropped;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("HRBatcher flush lifecycle", () => {
  it("start() + 2s tick + empty buffer → no fetch", async () => {
    const b = new HRBatcher(SESSION_ID, { onFlushed, onDropped });
    b.start();
    await vi.advanceTimersByTimeAsync(2000);
    await b.stop();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("start() + add + 2s tick → one POST + onFlushed(1)", async () => {
    const b = new HRBatcher(SESSION_ID, { onFlushed, onDropped });
    b.start();
    b.add(makeSample(10_000));
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onFlushed).toHaveBeenCalledWith(1);
    await b.stop();
  });

  it("retries once after 500, then succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const b = new HRBatcher(SESSION_ID, { onFlushed, onDropped });
    b.add(makeSample(10_000));
    await b.stop();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onFlushed).toHaveBeenCalledWith(1);
    expect(onDropped).not.toHaveBeenCalled();
  });

  it("two 500s → onDropped(n, 'post_failed_after_retry')", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
    const b = new HRBatcher(SESSION_ID, { onFlushed, onDropped });
    b.add(makeSample(10_000));
    await b.stop();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onDropped).toHaveBeenCalledWith(1, "post_failed_after_retry");
    expect(onFlushed).not.toHaveBeenCalled();
  });

  it("400 from server → no retry, immediate drop", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 400 }));
    const b = new HRBatcher(SESSION_ID, { onFlushed, onDropped });
    b.add(makeSample(10_000));
    await b.stop();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onDropped).toHaveBeenCalledTimes(1);
  });

  it("stop() flushes pending and clears the interval", async () => {
    const b = new HRBatcher(SESSION_ID, { onFlushed, onDropped });
    b.start();
    b.add(makeSample(10_000));
    await b.stop();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stop() drains samples added during an in-flight flush", async () => {
    type Resolver = (r: Response) => void;
    const resolverHolder: { fn: Resolver | null } = { fn: null };
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((resolve) => {
        resolverHolder.fn = resolve;
      }),
    );
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    const b = new HRBatcher(SESSION_ID, { onFlushed, onDropped });
    b.start();
    b.add(makeSample(10_000));
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    b.add(makeSample(12_000));

    const stopPromise = b.stop();
    await vi.advanceTimersByTimeAsync(200);
    resolverHolder.fn?.(new Response(null, { status: 200 }));
    // Drain remaining fake timers (the poll's 50ms setTimeout) so stop()
    // observes flushing=false on its next iteration and proceeds to drain.
    await vi.runAllTimersAsync();
    await stopPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const init = fetchMock.mock.calls[1][1] as RequestInit;
    const body = JSON.parse(init.body as string) as { samples: { hr: Array<{ t_ms: number }> } };
    expect(body.samples.hr).toHaveLength(1);
    expect(body.samples.hr[0].t_ms).toBe(12_000);
  });
});
