// Decoder for PMD Data frames carrying ACC samples (measurement type 0x02).
//
// Frame layout (common 10-byte header for all PMD streams):
//   byte 0:    measurement type (0x02 = ACC)
//   bytes 1-8: 64-bit nanosecond timestamp, little-endian, Polar epoch (2000-01-01 UTC)
//   byte 9:    frame type
//                0x01 = raw 16-bit triplets
//                0x80 = delta-encoded (NOT supported in V.0; we request raw via
//                       resolution_bits=16 in encodeStartAcc)
//   bytes 10+: samples
//
// Sample encoding (frame_type=0x01): three int16 LE per triplet (X, Y, Z) in
// units of milli-g. We pass them through as Int16Array (XYZ interleaved) so the
// SignalBatcher can ship the bytes verbatim to Storage.

import { MEAS_TYPE_ACC } from "./pmd-protocol";

export const ACC_FRAME_HEADER_BYTES = 10;
export const ACC_FRAME_TYPE_RAW_16 = 0x01;
export const ACC_FRAME_TYPE_DELTA = 0x80;
export const ACC_BYTES_PER_TRIPLET = 6;

export type AccFrame = {
  // Polar device timestamp, ns since 2000-01-01 UTC. The latest sample in the
  // frame sits at this timestamp; earlier samples are spaced 1/sample_rate_hz
  // before it. The batcher converts to session-relative ms.
  ref_timestamp_ns: bigint;
  frame_type: number;
  // Interleaved XYZ in milli-g. Length is triplets * 3.
  samples: Int16Array;
};

export function decodeAccFrame(view: DataView): AccFrame {
  if (view.byteLength < ACC_FRAME_HEADER_BYTES) {
    throw new Error(`ACC frame too short: ${view.byteLength} bytes`);
  }
  const measType = view.getUint8(0);
  if (measType !== MEAS_TYPE_ACC) {
    throw new Error(`ACC frame measurement type mismatch: 0x${measType.toString(16)}`);
  }
  const ref_timestamp_ns = view.getBigUint64(1, true);
  const frame_type = view.getUint8(9);

  if (frame_type === ACC_FRAME_TYPE_DELTA) {
    // TODO(slice 13.A+): support delta-encoded frames. For V.0 we always request
    // raw via resolution_bits=16 in encodeStartAcc, so this should not appear.
    throw new Error("ACC delta-encoded frames (0x80) not supported in V.0");
  }
  if (frame_type !== ACC_FRAME_TYPE_RAW_16) {
    throw new Error(`ACC frame type 0x${frame_type.toString(16)} not supported`);
  }

  const payloadBytes = view.byteLength - ACC_FRAME_HEADER_BYTES;
  if (payloadBytes % ACC_BYTES_PER_TRIPLET !== 0) {
    throw new Error(
      `ACC frame payload not a whole number of XYZ triplets: ${payloadBytes} bytes`,
    );
  }
  const triplets = payloadBytes / ACC_BYTES_PER_TRIPLET;
  const samples = new Int16Array(triplets * 3);
  let offset = ACC_FRAME_HEADER_BYTES;
  for (let i = 0; i < triplets; i++) {
    samples[i * 3 + 0] = view.getInt16(offset, true);
    samples[i * 3 + 1] = view.getInt16(offset + 2, true);
    samples[i * 3 + 2] = view.getInt16(offset + 4, true);
    offset += ACC_BYTES_PER_TRIPLET;
  }
  return { ref_timestamp_ns, frame_type, samples };
}
