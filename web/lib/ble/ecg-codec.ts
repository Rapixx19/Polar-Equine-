// Decoder for PMD Data frames carrying ECG samples (measurement type 0x00).
//
// Frame layout (common 10-byte header):
//   byte 0:    measurement type (0x00 = ECG)
//   bytes 1-8: 64-bit nanosecond timestamp, little-endian, Polar epoch (2000-01-01 UTC)
//   byte 9:    frame type (0x00 = ECG raw 14-bit, packed in 3 bytes per sample)
//   bytes 10+: samples, 3 bytes LE per sample, 24-bit two's-complement microvolts
//
// The wire payload is 3 bytes per sample (24-bit µV signed). We sign-extend bit 23
// and pack into Int32Array (4 bytes/sample) so downstream JS reads are cache-aligned
// and the binary blob in Storage is straightforward to load via numpy.frombuffer.

import { MEAS_TYPE_ECG } from "./pmd-protocol";

export const ECG_FRAME_HEADER_BYTES = 10;
export const ECG_FRAME_TYPE_RAW_14 = 0x00;
export const ECG_BYTES_PER_SAMPLE_WIRE = 3;
export const ECG_BYTES_PER_SAMPLE_BLOB = 4;

export type EcgFrame = {
  // Polar device timestamp, ns since 2000-01-01 UTC. Latest sample sits here;
  // earlier samples spaced 1/sample_rate_hz before. Batcher converts to ms.
  ref_timestamp_ns: bigint;
  frame_type: number;
  // µV, sign-extended from 24-bit two's-complement. Length = sample count.
  samples: Int32Array;
};

export function decodeEcgFrame(view: DataView): EcgFrame {
  if (view.byteLength < ECG_FRAME_HEADER_BYTES) {
    throw new Error(`ECG frame too short: ${view.byteLength} bytes`);
  }
  const measType = view.getUint8(0);
  if (measType !== MEAS_TYPE_ECG) {
    throw new Error(`ECG frame measurement type mismatch: 0x${measType.toString(16)}`);
  }
  const ref_timestamp_ns = view.getBigUint64(1, true);
  const frame_type = view.getUint8(9);
  if (frame_type !== ECG_FRAME_TYPE_RAW_14) {
    throw new Error(`ECG frame type 0x${frame_type.toString(16)} not supported`);
  }

  const payloadBytes = view.byteLength - ECG_FRAME_HEADER_BYTES;
  if (payloadBytes % ECG_BYTES_PER_SAMPLE_WIRE !== 0) {
    throw new Error(`ECG frame payload not a multiple of 3 bytes: ${payloadBytes}`);
  }
  const sampleCount = payloadBytes / ECG_BYTES_PER_SAMPLE_WIRE;
  const samples = new Int32Array(sampleCount);
  let offset = ECG_FRAME_HEADER_BYTES;
  for (let i = 0; i < sampleCount; i++) {
    const b0 = view.getUint8(offset);
    const b1 = view.getUint8(offset + 1);
    const b2 = view.getUint8(offset + 2);
    // Little-endian 24-bit → assemble then sign-extend bit 23.
    let value = b0 | (b1 << 8) | (b2 << 16);
    if (value & 0x800000) value |= ~0xffffff; // sign-extend
    samples[i] = value;
    offset += ECG_BYTES_PER_SAMPLE_WIRE;
  }
  return { ref_timestamp_ns, frame_type, samples };
}
