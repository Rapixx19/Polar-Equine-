import { describe, expect, it } from "vitest";

import {
  ECG_BYTES_PER_SAMPLE_WIRE,
  ECG_FRAME_HEADER_BYTES,
  ECG_FRAME_TYPE_RAW_14,
  decodeEcgFrame,
} from "@/lib/ble/ecg-codec";
import { MEAS_TYPE_ACC, MEAS_TYPE_ECG } from "@/lib/ble/pmd-protocol";

// Write a 24-bit two's-complement int as 3 little-endian bytes.
function write24LE(view: DataView, offset: number, value: number) {
  const masked = value & 0xffffff;
  view.setUint8(offset, masked & 0xff);
  view.setUint8(offset + 1, (masked >> 8) & 0xff);
  view.setUint8(offset + 2, (masked >> 16) & 0xff);
}

function buildEcgFrame(values: number[], opts: { timestampNs?: bigint; frameType?: number; measType?: number } = {}) {
  const measType = opts.measType ?? MEAS_TYPE_ECG;
  const frameType = opts.frameType ?? ECG_FRAME_TYPE_RAW_14;
  const timestampNs = opts.timestampNs ?? BigInt("1700000000000000000");
  const buf = new ArrayBuffer(ECG_FRAME_HEADER_BYTES + values.length * ECG_BYTES_PER_SAMPLE_WIRE);
  const view = new DataView(buf);
  view.setUint8(0, measType);
  view.setBigUint64(1, timestampNs, true);
  view.setUint8(9, frameType);
  let offset = ECG_FRAME_HEADER_BYTES;
  for (const value of values) {
    write24LE(view, offset, value);
    offset += ECG_BYTES_PER_SAMPLE_WIRE;
  }
  return view;
}

describe("ecg-codec decodeEcgFrame", () => {
  it("decodes positive 24-bit samples as µV", () => {
    const view = buildEcgFrame([100, 200, 4096, 0x7fffff]);
    const frame = decodeEcgFrame(view);
    expect(Array.from(frame.samples)).toEqual([100, 200, 4096, 0x7fffff]);
    expect(frame.frame_type).toBe(ECG_FRAME_TYPE_RAW_14);
  });

  it("sign-extends negative samples from bit 23", () => {
    // 0xffffff (24-bit -1), 0xffff00 (24-bit -256), 0x800000 (most-negative 24-bit)
    const view = buildEcgFrame([-1, -256, -8388608]);
    const frame = decodeEcgFrame(view);
    expect(Array.from(frame.samples)).toEqual([-1, -256, -8388608]);
  });

  it("packs into Int32Array (4 bytes per sample) for cache-friendly downstream reads", () => {
    const view = buildEcgFrame([1, 2, 3]);
    const frame = decodeEcgFrame(view);
    expect(frame.samples).toBeInstanceOf(Int32Array);
    expect(frame.samples.byteLength).toBe(3 * 4);
  });

  it("preserves the device nanosecond timestamp", () => {
    const view = buildEcgFrame([0], { timestampNs: BigInt("1234567890123456789") });
    const frame = decodeEcgFrame(view);
    expect(frame.ref_timestamp_ns).toBe(BigInt("1234567890123456789"));
  });

  it("throws on frames shorter than the 10-byte header", () => {
    const view = new DataView(new Uint8Array([0x00, 0x01, 0x02]).buffer);
    expect(() => decodeEcgFrame(view)).toThrow(/too short/);
  });

  it("throws when measurement type is not ECG (0x00)", () => {
    const view = buildEcgFrame([1], { measType: MEAS_TYPE_ACC });
    expect(() => decodeEcgFrame(view)).toThrow(/measurement type mismatch/);
  });

  it("throws on unsupported frame type", () => {
    const view = buildEcgFrame([1], { frameType: 0x42 });
    expect(() => decodeEcgFrame(view)).toThrow(/not supported/);
  });

  it("throws when payload is not a multiple of 3 bytes", () => {
    const buf = new ArrayBuffer(ECG_FRAME_HEADER_BYTES + 5);
    const view = new DataView(buf);
    view.setUint8(0, MEAS_TYPE_ECG);
    view.setUint8(9, ECG_FRAME_TYPE_RAW_14);
    expect(() => decodeEcgFrame(view)).toThrow(/multiple of 3/);
  });
});
