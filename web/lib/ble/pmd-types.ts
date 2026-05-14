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

// Control-point start sequences, verbatim from the official Polar PMD
// spec PDF. Do NOT modify these bytes; they are negotiated with the H10
// firmware. Per memory `reference_polar_pmd.md` (Slice 0 spike, 2026-05-02),
// no permissively-licensed JS port exists — we maintain the codec ourselves.
export const PMD_START_ECG = new Uint8Array([
  0x02, 0x00, 0x00, 0x01, 0x82, 0x00, 0x01, 0x01, 0x0e, 0x00,
]);

export const PMD_START_ACC = new Uint8Array([
  0x02, 0x02, 0x00, 0x01, 0x34, 0x00, 0x01, 0x01, 0x10, 0x00, 0x02, 0x01, 0x08, 0x00,
]);

export const PMD_SERVICE_UUID = "fb005c80-02e7-f387-1cad-8acd2d8df0c8";
export const PMD_CONTROL_POINT_UUID = "fb005c81-02e7-f387-1cad-8acd2d8df0c8";
export const PMD_DATA_UUID = "fb005c82-02e7-f387-1cad-8acd2d8df0c8";
