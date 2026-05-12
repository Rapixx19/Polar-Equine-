import { describe, expect, it } from "vitest";

import {
  BYTES_PER_SAMPLE_BY_STREAM,
  byteCountWithinTolerance,
  chunkCommitBody,
  chunkStoragePath,
  chunkUrlBody,
  expectedChunkBytes,
} from "@/lib/api/chunk-helpers";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

describe("chunkStoragePath", () => {
  it("zero-pads chunk_index to 6 digits", () => {
    expect(chunkStoragePath(SESSION_ID, "acc", 0)).toBe(`${SESSION_ID}/acc/000000.bin`);
    expect(chunkStoragePath(SESSION_ID, "ecg", 42)).toBe(`${SESSION_ID}/ecg/000042.bin`);
    expect(chunkStoragePath(SESSION_ID, "acc", 999_999)).toBe(`${SESSION_ID}/acc/999999.bin`);
  });
});

describe("expectedChunkBytes", () => {
  it("computes ACC bytes as duration_s * rate_hz * 6", () => {
    // 30 s * 200 Hz * 6 bytes/triplet = 36 000 bytes
    expect(expectedChunkBytes("acc", 30_000, 200)).toBe(36_000);
  });

  it("computes ECG bytes as duration_s * rate_hz * 4", () => {
    // 30 s * 130 Hz * 4 bytes/sample = 15 600 bytes
    expect(expectedChunkBytes("ecg", 30_000, 130)).toBe(15_600);
  });

  it("exposes bytes-per-sample constants matching the codec output", () => {
    expect(BYTES_PER_SAMPLE_BY_STREAM.acc).toBe(6);
    expect(BYTES_PER_SAMPLE_BY_STREAM.ecg).toBe(4);
  });
});

describe("byteCountWithinTolerance", () => {
  it("accepts values within ±20% of expected", () => {
    expect(byteCountWithinTolerance(100, 100)).toBe(true);
    expect(byteCountWithinTolerance(80, 100)).toBe(true);
    expect(byteCountWithinTolerance(120, 100)).toBe(true);
  });

  it("rejects values outside ±20% of expected", () => {
    expect(byteCountWithinTolerance(79, 100)).toBe(false);
    expect(byteCountWithinTolerance(121, 100)).toBe(false);
  });

  it("handles zero-expected as observed must also be zero", () => {
    expect(byteCountWithinTolerance(0, 0)).toBe(true);
    expect(byteCountWithinTolerance(1, 0)).toBe(false);
  });
});

describe("zod schemas", () => {
  it("chunkUrlBody validates a well-formed body", () => {
    const parsed = chunkUrlBody.safeParse({
      session_id: SESSION_ID,
      stream: "acc",
      chunk_index: 0,
    });
    expect(parsed.success).toBe(true);
  });

  it("chunkUrlBody rejects an invalid stream value", () => {
    const parsed = chunkUrlBody.safeParse({
      session_id: SESSION_ID,
      stream: "hr",
      chunk_index: 0,
    });
    expect(parsed.success).toBe(false);
  });

  it("chunkUrlBody rejects a non-uuid session_id", () => {
    const parsed = chunkUrlBody.safeParse({
      session_id: "not-a-uuid",
      stream: "acc",
      chunk_index: 0,
    });
    expect(parsed.success).toBe(false);
  });

  it("chunkCommitBody validates a well-formed ACC commit", () => {
    const parsed = chunkCommitBody.safeParse({
      session_id: SESSION_ID,
      stream: "acc",
      chunk_index: 0,
      start_t_ms: 0,
      end_t_ms: 30_000,
      sample_rate_hz: 200,
      resolution_bits: 16,
      range_g: 8,
      channels: 3,
      byte_count: 36_000,
    });
    expect(parsed.success).toBe(true);
  });

  it("chunkCommitBody validates a well-formed ECG commit (range_g omitted)", () => {
    const parsed = chunkCommitBody.safeParse({
      session_id: SESSION_ID,
      stream: "ecg",
      chunk_index: 5,
      start_t_ms: 150_000,
      end_t_ms: 180_000,
      sample_rate_hz: 130,
      resolution_bits: 14,
      channels: 1,
      byte_count: 15_600,
    });
    expect(parsed.success).toBe(true);
  });

  it("chunkCommitBody rejects a negative byte_count", () => {
    const parsed = chunkCommitBody.safeParse({
      session_id: SESSION_ID,
      stream: "acc",
      chunk_index: 0,
      start_t_ms: 0,
      end_t_ms: 30_000,
      sample_rate_hz: 200,
      resolution_bits: 16,
      channels: 3,
      byte_count: -1,
    });
    expect(parsed.success).toBe(false);
  });
});
