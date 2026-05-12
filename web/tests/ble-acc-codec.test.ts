import { describe, expect, it } from "vitest";

import {
  ACC_BYTES_PER_TRIPLET,
  ACC_FRAME_HEADER_BYTES,
  ACC_FRAME_TYPE_DELTA,
  ACC_FRAME_TYPE_RAW_16,
  decodeAccFrame,
} from "@/lib/ble/acc-codec";
import { MEAS_TYPE_ACC, MEAS_TYPE_ECG } from "@/lib/ble/pmd-protocol";

// Helper: build a synthetic ACC frame with N XYZ triplets.
function buildAccFrame(triplets: Array<[number, number, number]>, opts: { timestampNs?: bigint; frameType?: number; measType?: number } = {}) {
  const measType = opts.measType ?? MEAS_TYPE_ACC;
  const frameType = opts.frameType ?? ACC_FRAME_TYPE_RAW_16;
  const timestampNs = opts.timestampNs ?? BigInt("1700000000000000000");
  const buf = new ArrayBuffer(ACC_FRAME_HEADER_BYTES + triplets.length * ACC_BYTES_PER_TRIPLET);
  const view = new DataView(buf);
  view.setUint8(0, measType);
  view.setBigUint64(1, timestampNs, true);
  view.setUint8(9, frameType);
  let offset = ACC_FRAME_HEADER_BYTES;
  for (const [x, y, z] of triplets) {
    view.setInt16(offset, x, true);
    view.setInt16(offset + 2, y, true);
    view.setInt16(offset + 4, z, true);
    offset += ACC_BYTES_PER_TRIPLET;
  }
  return view;
}

describe("acc-codec decodeAccFrame", () => {
  it("decodes a frame with 3 triplets, XYZ interleaved in milli-g", () => {
    const view = buildAccFrame([
      [100, -200, 1000],
      [101, -199, 999],
      [102, -198, 998],
    ]);
    const frame = decodeAccFrame(view);
    expect(frame.ref_timestamp_ns).toBe(BigInt("1700000000000000000"));
    expect(frame.frame_type).toBe(ACC_FRAME_TYPE_RAW_16);
    expect(Array.from(frame.samples)).toEqual([
      100, -200, 1000,
      101, -199, 999,
      102, -198, 998,
    ]);
  });

  it("handles negative int16 samples (sign-extension via Int16Array)", () => {
    const view = buildAccFrame([[-32768, 32767, 0]]);
    const frame = decodeAccFrame(view);
    expect(Array.from(frame.samples)).toEqual([-32768, 32767, 0]);
  });

  it("throws on frames shorter than the 10-byte header", () => {
    const view = new DataView(new Uint8Array([0x02, 0x00, 0x00]).buffer);
    expect(() => decodeAccFrame(view)).toThrow(/too short/);
  });

  it("throws when measurement type is not ACC (0x02)", () => {
    const view = buildAccFrame([[1, 2, 3]], { measType: MEAS_TYPE_ECG });
    expect(() => decodeAccFrame(view)).toThrow(/measurement type mismatch/);
  });

  it("throws on delta-encoded frames (0x80)", () => {
    const view = buildAccFrame([[1, 2, 3]], { frameType: ACC_FRAME_TYPE_DELTA });
    expect(() => decodeAccFrame(view)).toThrow(/delta-encoded/);
  });

  it("throws on unknown frame type", () => {
    const view = buildAccFrame([[1, 2, 3]], { frameType: 0x42 });
    expect(() => decodeAccFrame(view)).toThrow(/not supported/);
  });

  it("throws when payload is not a whole number of triplets", () => {
    // 10-byte header + 7 payload bytes — not a multiple of 6.
    const buf = new ArrayBuffer(ACC_FRAME_HEADER_BYTES + 7);
    const view = new DataView(buf);
    view.setUint8(0, MEAS_TYPE_ACC);
    view.setUint8(9, ACC_FRAME_TYPE_RAW_16);
    expect(() => decodeAccFrame(view)).toThrow(/triplets/);
  });
});
