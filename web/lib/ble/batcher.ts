import type { HRSampleWire } from "@/lib/api/ingest-validation";
import type { HRSample } from "@/lib/ble/hr-codec";

const FLUSH_INTERVAL_MS = 2000;
const STOP_POLL_MS = 50;

export type BatcherEvents = {
  onFlushed: (count: number) => void;
  onDropped: (count: number, reason: string) => void;
};

export class HRBatcher {
  private buffer: HRSampleWire[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  constructor(
    private readonly sessionId: string,
    private readonly events: BatcherEvents,
  ) {}

  start(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
  }

  // Expand one HR notification into N wire rows: one per RR (timestamp back-
  // computed by subtracting cumulative later RRs from received_at), or one
  // HR-only row with rr_ms=null when no RRs in the frame. Per Rule 8, we
  // preserve every RR — losing them would silently degrade Slice 9's HRV calc.
  add(sample: HRSample): void {
    const contact = contactToWire(sample.contact);
    if (sample.rr_ms.length === 0) {
      this.buffer.push({ t_ms: sample.received_at, hr_bpm: sample.hr_bpm, rr_ms: null, contact });
      return;
    }
    let cumulativeOffsetMs = 0;
    const expanded: HRSampleWire[] = [];
    for (let i = sample.rr_ms.length - 1; i >= 0; i--) {
      const rr = Math.round(sample.rr_ms[i]);
      expanded.push({
        t_ms: sample.received_at - cumulativeOffsetMs,
        hr_bpm: sample.hr_bpm,
        rr_ms: rr,
        contact,
      });
      cumulativeOffsetMs += rr;
    }
    expanded.reverse();
    this.buffer.push(...expanded);
  }

  async stop(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = null;
    // Drain race: a timer-fired flush may be in flight, with samples arriving
    // since it started now sitting in this.buffer. Wait for it to release the
    // gate, then flush the residue ourselves.
    while (this.flushing) await new Promise((r) => setTimeout(r, STOP_POLL_MS));
    await this.flush();
  }

  private async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;
    this.flushing = true;
    const batch = this.buffer.splice(0, this.buffer.length);
    const startedAt = Date.now();
    try {
      const ok = await postWithOneRetry(this.sessionId, batch);
      if (ok) {
        this.events.onFlushed(batch.length);
        const elapsedSec = (Date.now() - startedAt) / 1000 || 0.001;
        console.log(
          `[hr-batch] flushed=${batch.length} post_ms=${Date.now() - startedAt} hz=${(batch.length / elapsedSec).toFixed(1)}`,
        );
      } else {
        this.events.onDropped(batch.length, "post_failed_after_retry");
        console.warn(`[hr-batch] dropped=${batch.length} reason=post_failed_after_retry`);
      }
    } finally {
      this.flushing = false;
    }
  }
}

function contactToWire(c: HRSample["contact"]): boolean | null {
  if (c === "contact") return true;
  if (c === "no_contact") return false;
  return null;
}

async function postWithOneRetry(sessionId: string, rows: HRSampleWire[]): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch("/api/ingest/samples", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, samples: { hr: rows } }),
      });
    } catch {
      // Network error — retry once, then give up.
      continue;
    }
    if (res.ok) return true;
    if (res.status >= 400 && res.status < 500) return false;
  }
  return false;
}
