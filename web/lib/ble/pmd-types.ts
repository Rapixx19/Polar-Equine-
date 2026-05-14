// Shared types for the Polar PMD codec + service + batchers.
// Pure types only — no runtime, no browser dependencies — so the codec
// tests can import without pulling Web Bluetooth.

export type PmdStreamType = "acc" | "ecg";

export type AccSample = {
  // Wall-clock millisecond timestamp, anchored to the first PMD frame
  // received in this session. See spec §"t_ms derivation" in the
  // Slice 12 design doc.
  t_ms: number;
  ax_mg: number;
  ay_mg: number;
  az_mg: number;
};

export type EcgSample = {
  t_ms: number;
  uv: number;
};

// Raw decoded frame envelope, before timestamps are anchored to wall clock.
// The codec returns pmd_ns from the H10's monotonic boot clock; the
// pmd-service layer translates to t_ms using the session anchor.
export type DecodedFrame =
  | { type: "acc"; pmd_ns: bigint; samples: Array<{ ax_mg: number; ay_mg: number; az_mg: number }> }
  | { type: "ecg"; pmd_ns: bigint; samples: Array<{ uv: number }> };

// Control-point start sequences. Setting-type opcodes per Polar PMD spec:
// 0x00=measurement-type/op, 0x04=sample_rate, 0x05=resolution, 0x06=range.
// (Earlier versions of this file used 0x00/0x01/0x02 for sample_rate/
// resolution/range — those opcodes don't exist in the spec, and the H10
// silently rejects the start command, which is why both ACC and ECG were
// returning 0 rows for every recorded session through 2026-05-14. Cross-
// checked against the bleakheart reference implementation.)
export const PMD_START_ECG = new Uint8Array([
  0x02, 0x00, 0x04, 0x01, 0x82, 0x00, 0x05, 0x01, 0x0e, 0x00,
]);

export const PMD_START_ACC = new Uint8Array([
  0x02, 0x02, 0x04, 0x01, 0x34, 0x00, 0x05, 0x01, 0x10, 0x00, 0x06, 0x01, 0x08, 0x00,
]);

export const PMD_SERVICE_UUID = "fb005c80-02e7-f387-1cad-8acd2d8df0c8";
export const PMD_CONTROL_POINT_UUID = "fb005c81-02e7-f387-1cad-8acd2d8df0c8";
export const PMD_DATA_UUID = "fb005c82-02e7-f387-1cad-8acd2d8df0c8";
