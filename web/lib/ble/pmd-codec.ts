// Polar PMD frame decoder.
//
// Pure: no I/O, no browser globals. Input is a DataView from a BLE notification;
// output is a decoded frame or null. Errors do NOT throw — a bad byte at offset
// 17 in a 1000-byte frame should not crash the recording session. We return
// what we could decode and the service layer surfaces partial frames.
//
// Per Cursor Rule 8 (raw data is sacred): if a frame cannot be decoded, we
// drop it from the result and log via the caller; we never silently emit
// fabricated samples.
//
// Source: Polar PMD Specification PDF, polar-ble-sdk repo, technical_documentation/
// (clean-room — see memory/reference_polar_pmd.md).

import type { DecodedFrame } from "./pmd-types";

const STREAM_ECG = 0x00;
const STREAM_ACC = 0x02;

// Per PMD spec the frame_type byte encodes the per-sample width:
//   ECG: 0x00 = signed 24-bit µV (the only frame the H10 emits — 14-bit
//        resolution stored in 24-bit signed words).
//   ACC: 0x01 = signed int16 mg per axis (what the H10 actually emits when
//        we request 16-bit resolution; earlier versions of this codec
//        checked for 0x00 and silently dropped every real frame).
//   ACC: 0x82 = delta frame on top of a 16-bit reference. Spec defines other
//        widths (0x80=8-bit ref, 0x83=24-bit ref) but at 52 Hz / 16-bit the
//        H10 in practice sends FULL 0x01 frames. We accept the 16-bit delta
//        form defensively in case firmware switches.
const ECG_FULL_24BIT = 0x00;
const ACC_FULL_16BIT = 0x01;
const ACC_DELTA_16BIT = 0x82;

const HEADER_LEN = 10; // 1 stream + 8 ts + 1 frame_type

export function decodePmdFrame(view: DataView): DecodedFrame | null {
  if (view.byteLength < HEADER_LEN) return null;
  const stream = view.getUint8(0);
  const pmd_ns = view.getBigUint64(1, true);
  const frame_type = view.getUint8(9);

  if (stream === STREAM_ECG && frame_type === ECG_FULL_24BIT) {
    return { type: "ecg", pmd_ns, samples: decodeEcgFull(view, HEADER_LEN) };
  }
  if (stream === STREAM_ACC && frame_type === ACC_FULL_16BIT) {
    return { type: "acc", pmd_ns, samples: decodeAccFull(view, HEADER_LEN) };
  }
  if (stream === STREAM_ACC && frame_type === ACC_DELTA_16BIT) {
    return { type: "acc", pmd_ns, samples: decodeAccDelta(view, HEADER_LEN) };
  }
  return null;
}

// ECG full frame: 3 bytes per sample, signed 24-bit µV, little-endian.
// Spec: 130 Hz, 14-bit resolution stored in 24-bit signed word.
function decodeEcgFull(view: DataView, offset: number): Array<{ uv: number }> {
  const out: Array<{ uv: number }> = [];
  for (let p = offset; p + 3 <= view.byteLength; p += 3) {
    const b0 = view.getUint8(p);
    const b1 = view.getUint8(p + 1);
    const b2 = view.getUint8(p + 2);
    let v = b0 | (b1 << 8) | (b2 << 16);
    if (v & 0x800000) v -= 0x1000000; // sign-extend 24-bit
    out.push({ uv: v });
  }
  return out;
}

// ACC full frame: 6 bytes per sample, int16 LE ax/ay/az, units = millig.
function decodeAccFull(
  view: DataView,
  offset: number,
): Array<{ ax_mg: number; ay_mg: number; az_mg: number }> {
  const out: Array<{ ax_mg: number; ay_mg: number; az_mg: number }> = [];
  for (let p = offset; p + 6 <= view.byteLength; p += 6) {
    out.push({
      ax_mg: view.getInt16(p, true),
      ay_mg: view.getInt16(p + 2, true),
      az_mg: view.getInt16(p + 4, true),
    });
  }
  return out;
}

// ACC delta frame, per spec PDF §"Delta frame encoding":
//   [ref_ax: i16 LE][ref_ay: i16 LE][ref_az: i16 LE]
//   then one or more blocks:
//     [bit_width: u8][sample_count: u8][packed signed deltas]
//   where deltas are emitted in axis-interleaved order (ax, ay, az, ax, …),
//   each delta is `bit_width` bits, signed, two's-complement.
//
// Samples are reconstructed by accumulating deltas onto the reference.
//
// Note (kill-switch context): the spec defines this layout but real-world
// H10 firmware has been observed to use small bit widths (4–10) and one
// block per notification. If horse-test frames decode to non-physical
// values, fall back to filtering `frame_type === FRAME_FULL` upstream
// in pmd-service and keep this function as a no-op for delta frames.
function decodeAccDelta(
  view: DataView,
  offset: number,
): Array<{ ax_mg: number; ay_mg: number; az_mg: number }> {
  if (view.byteLength < offset + 6) return [];
  let ax = view.getInt16(offset, true);
  let ay = view.getInt16(offset + 2, true);
  let az = view.getInt16(offset + 4, true);
  const out: Array<{ ax_mg: number; ay_mg: number; az_mg: number }> = [
    { ax_mg: ax, ay_mg: ay, az_mg: az },
  ];

  let pos = offset + 6;
  let bitPos = 0;
  while (pos + 2 <= view.byteLength) {
    const bitWidth = view.getUint8(pos);
    const sampleCount = view.getUint8(pos + 1);
    pos += 2;
    bitPos = 0;
    if (bitWidth === 0 || bitWidth > 16 || sampleCount === 0) break;
    const totalBits = bitWidth * 3 * sampleCount;
    const totalBytes = Math.ceil(totalBits / 8);
    if (pos + totalBytes > view.byteLength) break;

    for (let i = 0; i < sampleCount; i++) {
      const dx = readSignedBits(view, pos, bitPos, bitWidth);
      bitPos += bitWidth;
      const dy = readSignedBits(view, pos, bitPos, bitWidth);
      bitPos += bitWidth;
      const dz = readSignedBits(view, pos, bitPos, bitWidth);
      bitPos += bitWidth;
      ax += dx;
      ay += dy;
      az += dz;
      out.push({ ax_mg: ax, ay_mg: ay, az_mg: az });
    }
    pos += Math.ceil(bitPos / 8);
  }
  return out;
}

// Read `width` bits starting at byte `byteStart + floor(bitStart/8)`, then
// sign-extend. Little-endian packing: byte 0 holds the least-significant bits.
function readSignedBits(view: DataView, byteStart: number, bitStart: number, width: number): number {
  let value = 0;
  for (let b = 0; b < width; b++) {
    const bitIndex = bitStart + b;
    const byte = view.getUint8(byteStart + (bitIndex >> 3));
    const bit = (byte >> (bitIndex & 7)) & 1;
    if (bit) value |= 1 << b;
  }
  const signMask = 1 << (width - 1);
  if (value & signMask) value -= 1 << width;
  return value;
}
