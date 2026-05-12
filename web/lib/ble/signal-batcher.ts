// Chunked binary uploader for raw PMD signal streams (ACC, ECG).
//
// Buffers raw 16-bit / 32-bit samples in a typed array, flushes every
// CHUNK_DURATION_MS to Supabase Storage via a signed upload URL, and registers
// the resulting blob row via POST /api/ingest/chunk-commit. Mirrors the
// post-with-one-retry semantics of HRBatcher but ships raw bytes instead of
// JSON.
//
// Browser-only — never imported from server routes.

import type { SignalStream } from "@/lib/api/chunk-helpers";

const CHUNK_DURATION_MS_DEFAULT = 30_000;
const STOP_POLL_MS = 50;

export type SignalBatcherEvents = {
  onUploaded: (bytes: number, chunkIndex: number) => void;
  onDropped: (bytes: number, reason: string) => void;
};

export type SignalBatcherConfig = {
  sample_rate_hz: number;
  resolution_bits: number;
  range_g?: number | null;
  channels: number;
  chunkDurationMs?: number;
};

// Storage holds raw bytes regardless of the typed-array view emitted by the
// codec. We accept both Int16Array (ACC) and Int32Array (ECG) via the union.
export type SignalSampleBatch = Int16Array | Int32Array;

export class SignalBatcher {
  private readonly chunkDurationMs: number;
  private readonly bytesPerSample: number;
  private buffer: Uint8Array[] = [];
  private bufferedBytes = 0;
  private chunkIndex = 0;
  // Session-relative timestamp (ms) of the FIRST sample currently buffered.
  // null when buffer is empty (next addSamples seeds it).
  private chunkStartMs: number | null = null;
  // Session-relative timestamp of the most recent sample in the buffer.
  private chunkEndMs: number | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  constructor(
    private readonly sessionId: string,
    private readonly stream: SignalStream,
    private readonly config: SignalBatcherConfig,
    private readonly events: SignalBatcherEvents,
  ) {
    this.chunkDurationMs = config.chunkDurationMs ?? CHUNK_DURATION_MS_DEFAULT;
    this.bytesPerSample =
      stream === "acc"
        ? 2 // each int16 channel; XYZ interleaved = 6 bytes per triplet
        : 4; // int32 µV
  }

  start(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => void this.flush(false), this.chunkDurationMs);
  }

  // Append samples observed at session-relative timestamp_ms. The codec gives
  // us interleaved samples; we treat the entire batch as falling at this single
  // timestamp for chunking-boundary purposes — algorithms reconstruct sub-frame
  // timing from sample_rate_hz, not from per-sample timestamps.
  addSamples(timestamp_ms: number, samples: SignalSampleBatch): void {
    if (samples.length === 0) return;
    const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
    // Copy to detach from the codec's backing buffer (BLE characteristic value
    // gets recycled by Web Bluetooth on the next notification).
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    this.buffer.push(copy);
    this.bufferedBytes += copy.length;
    if (this.chunkStartMs === null) this.chunkStartMs = timestamp_ms;
    this.chunkEndMs = timestamp_ms;
  }

  async stop(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = null;
    while (this.flushing) await new Promise((r) => setTimeout(r, STOP_POLL_MS));
    await this.flush(true);
  }

  // Splice current buffer + upload. If draining=true on stop(), uploads even a
  // short final chunk. Returns silently on idle.
  private async flush(draining: boolean): Promise<void> {
    if (this.flushing) return;
    if (this.bufferedBytes === 0) return;
    if (!draining && this.chunkStartMs === null) return;
    this.flushing = true;

    const parts = this.buffer;
    const byteCount = this.bufferedBytes;
    const startMs = this.chunkStartMs ?? 0;
    const endMs = this.chunkEndMs ?? startMs;
    const chunkIndex = this.chunkIndex;
    this.buffer = [];
    this.bufferedBytes = 0;
    this.chunkStartMs = null;
    this.chunkEndMs = null;
    this.chunkIndex += 1;

    try {
      const blob = concat(parts, byteCount);
      const ok = await uploadAndCommitWithOneRetry({
        sessionId: this.sessionId,
        stream: this.stream,
        chunkIndex,
        startMs,
        endMs,
        sampleRateHz: this.config.sample_rate_hz,
        resolutionBits: this.config.resolution_bits,
        rangeG: this.config.range_g ?? null,
        channels: this.config.channels,
        bytes: blob,
      });
      if (ok) {
        this.events.onUploaded(byteCount, chunkIndex);
      } else {
        this.events.onDropped(byteCount, "upload_failed_after_retry");
        console.warn(`[signal-batch:${this.stream}] dropped chunk=${chunkIndex} bytes=${byteCount}`);
      }
    } finally {
      this.flushing = false;
    }
  }
}

function concat(parts: Uint8Array[], totalBytes: number): Uint8Array {
  const out = new Uint8Array(totalBytes);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

type UploadArgs = {
  sessionId: string;
  stream: SignalStream;
  chunkIndex: number;
  startMs: number;
  endMs: number;
  sampleRateHz: number;
  resolutionBits: number;
  rangeG: number | null;
  channels: number;
  bytes: Uint8Array;
};

async function uploadAndCommitWithOneRetry(args: UploadArgs): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const success = await uploadAndCommitOnce(args);
    if (success === "ok") return true;
    if (success === "fatal") return false;
    // retryable
  }
  return false;
}

type AttemptResult = "ok" | "fatal" | "retryable";

async function uploadAndCommitOnce(args: UploadArgs): Promise<AttemptResult> {
  // Step 1: ask the server for a signed upload URL.
  let urlRes: Response;
  try {
    urlRes = await fetch("/api/ingest/chunk-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: args.sessionId,
        stream: args.stream,
        chunk_index: args.chunkIndex,
      }),
    });
  } catch {
    return "retryable";
  }
  if (!urlRes.ok) return urlRes.status >= 500 ? "retryable" : "fatal";
  const urlPayload = (await urlRes.json().catch(() => null)) as
    | { url: string; storage_path: string; token?: string }
    | null;
  if (!urlPayload?.url) return "fatal";

  // Step 2: PUT raw bytes to Supabase Storage.
  let putRes: Response;
  try {
    putRes = await fetch(urlPayload.url, {
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
      // Cast: TS 5.7 narrowed Uint8Array's ArrayBufferLike generic, but fetch's
      // BodyInit accepts the runtime value fine.
      body: args.bytes as BodyInit,
    });
  } catch {
    return "retryable";
  }
  if (!putRes.ok) return putRes.status >= 500 ? "retryable" : "fatal";

  // Step 3: register the chunk row.
  let commitRes: Response;
  try {
    commitRes = await fetch("/api/ingest/chunk-commit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: args.sessionId,
        stream: args.stream,
        chunk_index: args.chunkIndex,
        start_t_ms: args.startMs,
        end_t_ms: args.endMs,
        sample_rate_hz: args.sampleRateHz,
        resolution_bits: args.resolutionBits,
        range_g: args.rangeG,
        channels: args.channels,
        byte_count: args.bytes.byteLength,
      }),
    });
  } catch {
    return "retryable";
  }
  if (!commitRes.ok) return commitRes.status >= 500 ? "retryable" : "fatal";
  return "ok";
}
