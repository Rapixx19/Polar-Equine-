// RR-expansion math is the highest-stakes part of the batcher: getting the
// back-computed t_ms wrong would silently corrupt Slice 9's HRV calculation.
// Each case below uses hand-computed expected values, not just shape checks.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HRBatcher } from "@/lib/ble/batcher";
import type { HRSample } from "@/lib/ble/hr-codec";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

let fetchMock: ReturnType<typeof vi.fn>;

function makeSample(over: Partial<HRSample> = {}): HRSample {
  return {
    hr_bpm: 60,
    contact: "contact",
    rr_ms: [],
    received_at: 10_000,
    ...over,
  };
}

function getPostedRows(call: number) {
  const init = fetchMock.mock.calls[call][1] as RequestInit;
  const body = JSON.parse(init.body as string) as {
    samples: { hr: Array<{ t_ms: number; hr_bpm: number; rr_ms: number | null; contact: boolean | null }> };
  };
  return body.samples.hr;
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("HRBatcher.add — RR expansion", () => {
  it("rr_ms=[] emits one wire row with rr_ms=null", async () => {
    const b = new HRBatcher(SESSION_ID, { onFlushed: () => {}, onDropped: () => {} });
    b.add(makeSample({ rr_ms: [], received_at: 10_000 }));
    await b.stop();
    const rows = getPostedRows(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ t_ms: 10_000, rr_ms: null, hr_bpm: 60, contact: true });
  });

  it("rr_ms=[1000] received_at=10000 → one row at t=10000, rr=1000", async () => {
    const b = new HRBatcher(SESSION_ID, { onFlushed: () => {}, onDropped: () => {} });
    b.add(makeSample({ rr_ms: [1000], received_at: 10_000 }));
    await b.stop();
    const rows = getPostedRows(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ t_ms: 10_000, rr_ms: 1000 });
  });

  it("rr_ms=[800,1200] received_at=10000 → rows [{t:8800,rr:800},{t:10000,rr:1200}]", async () => {
    const b = new HRBatcher(SESSION_ID, { onFlushed: () => {}, onDropped: () => {} });
    b.add(makeSample({ rr_ms: [800, 1200], received_at: 10_000 }));
    await b.stop();
    const rows = getPostedRows(0);
    expect(rows).toEqual([
      { t_ms: 8800, hr_bpm: 60, rr_ms: 800, contact: true },
      { t_ms: 10_000, hr_bpm: 60, rr_ms: 1200, contact: true },
    ]);
  });

  it("rr_ms=[900,1000,1100] received_at=20000 → rows at t=[17900,18900,20000]", async () => {
    const b = new HRBatcher(SESSION_ID, { onFlushed: () => {}, onDropped: () => {} });
    b.add(makeSample({ rr_ms: [900, 1000, 1100], received_at: 20_000 }));
    await b.stop();
    const rows = getPostedRows(0);
    expect(rows.map((r) => r.t_ms)).toEqual([17_900, 18_900, 20_000]);
    expect(rows.map((r) => r.rr_ms)).toEqual([900, 1000, 1100]);
  });

  it("contact mapping: contact→true, no_contact→false, unsupported→null", async () => {
    const b = new HRBatcher(SESSION_ID, { onFlushed: () => {}, onDropped: () => {} });
    b.add(makeSample({ contact: "contact", rr_ms: [] }));
    b.add(makeSample({ contact: "no_contact", rr_ms: [] }));
    b.add(makeSample({ contact: "unsupported", rr_ms: [] }));
    await b.stop();
    const rows = getPostedRows(0);
    expect(rows.map((r) => r.contact)).toEqual([true, false, null]);
  });
});
