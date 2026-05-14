import { describe, expect, it } from "vitest";

import { decodePmdFrame } from "@/lib/ble/pmd-codec";

// Header builder: stream type + 8-byte pmd_ns timestamp + frame_type.
function header(stream: number, frameType: number, ts_ns: bigint): number[] {
  const ts = new Uint8Array(8);
  const dv = new DataView(ts.buffer);
  dv.setBigUint64(0, ts_ns, true);
  return [stream, ...Array.from(ts), frameType];
}

function toView(bytes: number[]): DataView {
  return new DataView(new Uint8Array(bytes).buffer);
}

// Pack 3-axis signed deltas into a little-endian bit stream at `bitWidth` bits
// per delta, axis-interleaved (ax, ay, az, ax, ay, az, …). Mirrors the inverse
// of decodeAccDelta's reader so we can synthesise fixtures from the spec.
function packDeltas(deltas: Array<[number, number, number]>, bitWidth: number): number[] {
  const totalBits = deltas.length * 3 * bitWidth;
  const out = new Uint8Array(Math.ceil(totalBits / 8));
  let bitPos = 0;
  const mask = (1 << bitWidth) - 1;
  const writeOne = (v: number) => {
    const unsigned = v & mask;
    for (let b = 0; b < bitWidth; b++) {
      const bit = (unsigned >> b) & 1;
      if (bit) out[(bitPos + b) >> 3] |= 1 << ((bitPos + b) & 7);
    }
    bitPos += bitWidth;
  };
  for (const [dx, dy, dz] of deltas) {
    writeOne(dx);
    writeOne(dy);
    writeOne(dz);
  }
  return Array.from(out);
}

describe("decodePmdFrame", () => {
  it("returns null for too-short buffer", () => {
    expect(decodePmdFrame(toView([0x00, 0x01]))).toBeNull();
  });

  it("returns null for unknown stream type", () => {
    const bytes = [...header(0x07, 0x00, BigInt(0)), 0x01, 0x02, 0x03];
    expect(decodePmdFrame(toView(bytes))).toBeNull();
  });

  it("decodes ECG full frame: 3 samples of signed 24-bit µV", () => {
    // Samples: +1000, -1000, +8388607 (max positive 24-bit)
    const payload = [
      0xe8, 0x03, 0x00, // 1000
      0x18, 0xfc, 0xff, // -1000 in 24-bit two's complement = 0xfffc18
      0xff, 0xff, 0x7f, // 8388607
    ];
    const bytes = [...header(0x00, 0x00, BigInt(12345)), ...payload];
    const frame = decodePmdFrame(toView(bytes));
    expect(frame?.type).toBe("ecg");
    if (frame?.type !== "ecg") throw new Error("type narrow");
    expect(frame.pmd_ns).toBe(BigInt(12345));
    expect(frame.samples).toEqual([{ uv: 1000 }, { uv: -1000 }, { uv: 8388607 }]);
  });

  it("decodes ACC full frame: 2 samples of int16 LE ax/ay/az", () => {
    const payload = [
      0xe8, 0x03, 0x18, 0xfc, 0x00, 0x04, // (1000, -1000, 1024)
      0x00, 0x00, 0x00, 0x00, 0xff, 0x7f, // (0, 0, 32767)
    ];
    const bytes = [...header(0x02, 0x01, BigInt(999)), ...payload];
    const frame = decodePmdFrame(toView(bytes));
    expect(frame?.type).toBe("acc");
    if (frame?.type !== "acc") throw new Error("type narrow");
    expect(frame.pmd_ns).toBe(BigInt(999));
    expect(frame.samples).toEqual([
      { ax_mg: 1000, ay_mg: -1000, az_mg: 1024 },
      { ax_mg: 0, ay_mg: 0, az_mg: 32767 },
    ]);
  });

  it("decodes ACC delta frame: ref + 2 deltas at 4-bit width", () => {
    // Reference (1000, -1000, 1024)
    const ref = [0xe8, 0x03, 0x18, 0xfc, 0x00, 0x04];
    // Block: bit_width=4, sample_count=2, deltas axis-interleaved.
    // Sample 1: (+1, -2, +3) → ax 1001, ay -1002, az 1027
    // Sample 2: (-1, +0, +2) → ax 1000, ay -1002, az 1029
    const deltas: Array<[number, number, number]> = [
      [1, -2, 3],
      [-1, 0, 2],
    ];
    const block = [0x04, 0x02, ...packDeltas(deltas, 4)];
    const bytes = [...header(0x02, 0x82, BigInt(7777)), ...ref, ...block];
    const frame = decodePmdFrame(toView(bytes));
    expect(frame?.type).toBe("acc");
    if (frame?.type !== "acc") throw new Error("type narrow");
    expect(frame.pmd_ns).toBe(BigInt(7777));
    expect(frame.samples).toEqual([
      { ax_mg: 1000, ay_mg: -1000, az_mg: 1024 },
      { ax_mg: 1001, ay_mg: -1002, az_mg: 1027 },
      { ax_mg: 1000, ay_mg: -1002, az_mg: 1029 },
    ]);
  });

  it("decodes ACC delta with 8-bit width", () => {
    const ref = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    const deltas: Array<[number, number, number]> = [[10, -10, 100]];
    const block = [0x08, 0x01, ...packDeltas(deltas, 8)];
    const bytes = [...header(0x02, 0x82, BigInt(1)), ...ref, ...block];
    const frame = decodePmdFrame(toView(bytes));
    if (frame?.type !== "acc") throw new Error("type narrow");
    expect(frame.samples).toEqual([
      { ax_mg: 0, ay_mg: 0, az_mg: 0 },
      { ax_mg: 10, ay_mg: -10, az_mg: 100 },
    ]);
  });

  it("returns partial samples on truncated ACC full payload", () => {
    // One complete sample then a stray 4 bytes (less than 6 = no second).
    const payload = [0x01, 0x00, 0x02, 0x00, 0x03, 0x00, 0xff, 0xff, 0xff, 0xff];
    const bytes = [...header(0x02, 0x01, BigInt(0)), ...payload];
    const frame = decodePmdFrame(toView(bytes));
    if (frame?.type !== "acc") throw new Error("type narrow");
    expect(frame.samples).toEqual([{ ax_mg: 1, ay_mg: 2, az_mg: 3 }]);
  });

  it("does not throw on truncated ACC delta block", () => {
    const ref = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    // bit_width=4, sample_count=10 but only 3 bytes of payload.
    const block = [0x04, 0x0a, 0xff, 0xff, 0xff];
    const bytes = [...header(0x02, 0x82, BigInt(0)), ...ref, ...block];
    expect(() => decodePmdFrame(toView(bytes))).not.toThrow();
    const frame = decodePmdFrame(toView(bytes));
    if (frame?.type !== "acc") throw new Error("type narrow");
    // Only the reference sample is reliable.
    expect(frame.samples[0]).toEqual({ ax_mg: 0, ay_mg: 0, az_mg: 0 });
  });
});
