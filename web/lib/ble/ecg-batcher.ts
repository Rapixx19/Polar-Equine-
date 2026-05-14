import type { EcgSampleWire } from "@/lib/api/ingest-validation";
import type { EcgSample } from "@/lib/ble/pmd-types";

const FLUSH_INTERVAL_MS = 2000;
const STOP_POLL_MS = 50;

export type BatcherEvents = {
  onFlushed: (count: number) => void;
  onDropped: (count: number, reason: string) => void;
};

// Mirrors HRBatcher / ACCBatcher: 2-s flush, single-flight gate, drain on stop.
// ECG at 130 Hz means each 2-s flush carries ~260 rows — bigger than HR or ACC
// batches but still well under any sane HTTP body limit.
export class ECGBatcher {
  private buffer: EcgSampleWire[] = [];
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

  add(batch: EcgSample[]): void {
    for (const s of batch) {
      this.buffer.push({ t_ms: s.t_ms, uv: s.uv });
    }
  }

  async stop(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = null;
    while (this.flushing) await new Promise((r) => setTimeout(r, STOP_POLL_MS));
    await this.flush();
  }

  private async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;
    this.flushing = true;
    const batch = this.buffer.splice(0, this.buffer.length);
    try {
      const ok = await postWithOneRetry(this.sessionId, batch);
      if (ok) {
        this.events.onFlushed(batch.length);
        console.log(`[ecg-batch] flushed=${batch.length}`);
      } else {
        this.events.onDropped(batch.length, "post_failed_after_retry");
        console.warn(`[ecg-batch] dropped=${batch.length} reason=post_failed_after_retry`);
      }
    } finally {
      this.flushing = false;
    }
  }
}

async function postWithOneRetry(sessionId: string, rows: EcgSampleWire[]): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch("/api/ingest/samples", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, samples: { ecg: rows } }),
      });
    } catch (e) {
      console.warn("[ecg-batch] network_error", e);
      continue;
    }
    if (res.ok) return true;
    if (res.status >= 400 && res.status < 500) {
      const body = await res.text().catch(() => "");
      console.warn(`[ecg-batch] post ${res.status}`, body.slice(0, 240), "first_row=", rows[0]);
      return false;
    }
  }
  return false;
}
