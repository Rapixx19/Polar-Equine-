// Pure encode/decode helpers for the Polar PMD (Polar Measurement Data) Control
// Point. Byte sequences and error codes verified against polar-ble-sdk + the Vaadin
// PolarH10-streaming reference + the arctic Rust crate.
//
// PMD Service:        fb005c80-02e7-f387-1cad-8acd2d8df0c8
// PMD Control Point:  fb005c81-02e7-f387-1cad-8acd2d8df0c8  (read + write + indicate)
// PMD Data:           fb005c82-02e7-f387-1cad-8acd2d8df0c8  (notify)

export const PMD_SERVICE_UUID = "fb005c80-02e7-f387-1cad-8acd2d8df0c8";
export const PMD_CONTROL_POINT_UUID = "fb005c81-02e7-f387-1cad-8acd2d8df0c8";
export const PMD_DATA_UUID = "fb005c82-02e7-f387-1cad-8acd2d8df0c8";

// PMD measurement type IDs (byte 0 of every Data frame, byte 1 of START commands).
export const MEAS_TYPE_ECG = 0x00;
export const MEAS_TYPE_ACC = 0x02;

export type MeasType = typeof MEAS_TYPE_ECG | typeof MEAS_TYPE_ACC;

// Setting type IDs inside START commands.
const SETTING_SAMPLE_RATE = 0x00;
const SETTING_RESOLUTION = 0x01;
const SETTING_RANGE_G = 0x02;

// Operation codes for Control Point writes.
const OP_START = 0x02;
const OP_STOP = 0x03;

// Control Point response codes (byte 3 of an indication).
export const PMD_ERROR_CODES = {
  SUCCESS: 0x00,
  INVALID_OP_CODE: 0x01,
  INVALID_MEAS_TYPE: 0x02,
  NOT_SUPPORTED: 0x03,
  INVALID_LENGTH: 0x04,
  INVALID_PARAMETER: 0x05,
  ALREADY_IN_STATE: 0x06,
  INVALID_RESOLUTION: 0x07,
  INVALID_SAMPLE_RATE: 0x08,
  INVALID_RANGE: 0x09,
  INVALID_MTU: 0x0A,
  INVALID_NUMBER_OF_CHANNELS: 0x0B,
  INVALID_STATE: 0x0C,
  DEVICE_IN_CHARGER: 0x0D,
} as const;

const ERROR_NAME_BY_CODE = new Map<number, string>(
  Object.entries(PMD_ERROR_CODES).map(([name, code]) => [code, name]),
);

export function pmdErrorName(code: number): string {
  return ERROR_NAME_BY_CODE.get(code) ?? `UNKNOWN_${code.toString(16).padStart(2, "0")}`;
}

export type AccStartOpts = {
  rate_hz: 25 | 50 | 100 | 200;
  range_g: 2 | 4 | 8;
  resolution_bits: 16;
};

export type EcgStartOpts = {
  rate_hz: 130;
  resolution_bits: 14;
};

// Encode a START ACC command per the PMD spec:
// [OP_START, MEAS_TYPE_ACC,
//  SETTING_SAMPLE_RATE, 0x01, rate_lo, rate_hi,
//  SETTING_RESOLUTION,  0x01, res_lo,  res_hi,
//  SETTING_RANGE_G,     0x01, range_lo, range_hi]
export function encodeStartAcc(opts: AccStartOpts): Uint8Array {
  const buf = new Uint8Array(14);
  buf[0] = OP_START;
  buf[1] = MEAS_TYPE_ACC;
  buf[2] = SETTING_SAMPLE_RATE;
  buf[3] = 0x01;
  buf[4] = opts.rate_hz & 0xff;
  buf[5] = (opts.rate_hz >> 8) & 0xff;
  buf[6] = SETTING_RESOLUTION;
  buf[7] = 0x01;
  buf[8] = opts.resolution_bits & 0xff;
  buf[9] = (opts.resolution_bits >> 8) & 0xff;
  buf[10] = SETTING_RANGE_G;
  buf[11] = 0x01;
  buf[12] = opts.range_g & 0xff;
  buf[13] = (opts.range_g >> 8) & 0xff;
  return buf;
}

// Encode a START ECG command per the PMD spec:
// [OP_START, MEAS_TYPE_ECG,
//  SETTING_SAMPLE_RATE, 0x01, rate_lo, rate_hi,
//  SETTING_RESOLUTION,  0x01, res_lo,  res_hi]
export function encodeStartEcg(opts: EcgStartOpts): Uint8Array {
  const buf = new Uint8Array(10);
  buf[0] = OP_START;
  buf[1] = MEAS_TYPE_ECG;
  buf[2] = SETTING_SAMPLE_RATE;
  buf[3] = 0x01;
  buf[4] = opts.rate_hz & 0xff;
  buf[5] = (opts.rate_hz >> 8) & 0xff;
  buf[6] = SETTING_RESOLUTION;
  buf[7] = 0x01;
  buf[8] = opts.resolution_bits & 0xff;
  buf[9] = (opts.resolution_bits >> 8) & 0xff;
  return buf;
}

// Encode a STOP command for the given measurement type: [OP_STOP, measType].
export function encodeStop(measType: MeasType): Uint8Array {
  return new Uint8Array([OP_STOP, measType]);
}

export type ControlResponse = {
  ok: boolean;
  errorCode: number;
  errorName: string;
  // Echoed op code from the originating command (start = 0x02, stop = 0x03).
  responseToOp: number;
  // Echoed measurement type (0x00 ECG, 0x02 ACC).
  measType: number;
};

// Decode a Control Point indication. Format per polar-ble-sdk:
//   byte 0: response op code (always 0xF0 for "control point response")
//   byte 1: op code we sent (0x02 start, 0x03 stop, 0x01 read settings)
//   byte 2: measurement type we sent
//   byte 3: error code (0x00 = SUCCESS)
//   bytes 4+: optional payload (settings for OP_GET_MEAS_SETTINGS responses)
export function parseControlResponse(view: DataView): ControlResponse {
  if (view.byteLength < 4) {
    throw new Error(`PMD control response too short: ${view.byteLength} bytes`);
  }
  const responseToOp = view.getUint8(1);
  const measType = view.getUint8(2);
  const errorCode = view.getUint8(3);
  return {
    ok: errorCode === PMD_ERROR_CODES.SUCCESS,
    errorCode,
    errorName: pmdErrorName(errorCode),
    responseToOp,
    measType,
  };
}
