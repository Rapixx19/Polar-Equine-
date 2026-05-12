// Shared zod schemas + helpers for the /api/ingest/chunk-url and
// /api/ingest/chunk-commit endpoints. Used by both the browser uploader
// (web/lib/ble/signal-batcher.ts) and the server routes.

import { z } from "zod";

export const SIGNAL_BLOBS_BUCKET = "signal-blobs";
export const CHUNK_INDEX_PAD = 6; // 6-digit zero-padded → up to 1M chunks per stream
export const SIGNAL_STREAMS = ["acc", "ecg"] as const;
export type SignalStream = (typeof SIGNAL_STREAMS)[number];

// Bytes-per-sample on disk (matches what the codecs emit). ACC packs 3 channels
// of int16 per triplet → 6 bytes/triplet. ECG packs int32 per sample.
export const BYTES_PER_SAMPLE_BY_STREAM: Record<SignalStream, number> = {
  acc: 6, // one XYZ triplet
  ecg: 4,
};

// Number of "samples per second" in the byte_count tolerance check. For ACC, a
// "sample" is one XYZ triplet (so the rate is e.g. 200 Hz of triplets, not
// 600 Hz of channels). For ECG, a sample is one µV reading.

// Tolerance for the byte_count sanity check on chunk-commit. Real chunks may
// over- or under-shoot the nominal duration because notification timing isn't
// quantised; ±20 % matches the plan and absorbs realistic BLE jitter.
export const BYTE_COUNT_TOLERANCE = 0.2;

export const chunkUrlBody = z.object({
  session_id: z.string().uuid(),
  stream: z.enum(SIGNAL_STREAMS),
  chunk_index: z.number().int().min(0).max(999_999),
});
export type ChunkUrlBody = z.infer<typeof chunkUrlBody>;

export const chunkCommitBody = z.object({
  session_id: z.string().uuid(),
  stream: z.enum(SIGNAL_STREAMS),
  chunk_index: z.number().int().min(0).max(999_999),
  start_t_ms: z.number().int().nonnegative(),
  end_t_ms: z.number().int().nonnegative(),
  sample_rate_hz: z.number().int().min(1).max(2000),
  resolution_bits: z.number().int().min(1).max(32),
  range_g: z.number().int().min(1).max(64).nullable().optional(),
  channels: z.number().int().min(1).max(8),
  byte_count: z.number().int().min(0).max(10_000_000),
});
export type ChunkCommitBody = z.infer<typeof chunkCommitBody>;

export function chunkStoragePath(
  sessionId: string,
  stream: SignalStream,
  chunkIndex: number,
): string {
  const padded = chunkIndex.toString().padStart(CHUNK_INDEX_PAD, "0");
  return `${sessionId}/${stream}/${padded}.bin`;
}

// Expected chunk size in bytes given duration + sample rate + stream.
export function expectedChunkBytes(
  stream: SignalStream,
  durationMs: number,
  sampleRateHz: number,
): number {
  const seconds = durationMs / 1000;
  return Math.round(seconds * sampleRateHz * BYTES_PER_SAMPLE_BY_STREAM[stream]);
}

// True if observed byte_count is within ±BYTE_COUNT_TOLERANCE of expected size.
export function byteCountWithinTolerance(
  observed: number,
  expected: number,
  tolerance: number = BYTE_COUNT_TOLERANCE,
): boolean {
  // Empty chunk is only OK if expected is also ~0; otherwise out of tolerance.
  if (expected <= 0) return observed === 0;
  const ratio = observed / expected;
  return ratio >= 1 - tolerance && ratio <= 1 + tolerance;
}
