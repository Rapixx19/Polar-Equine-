import { describe, expect, it } from "vitest";

import {
  MEAS_TYPE_ACC,
  MEAS_TYPE_ECG,
  PMD_ERROR_CODES,
  encodeStartAcc,
  encodeStartEcg,
  encodeStop,
  parseControlResponse,
  pmdErrorName,
} from "@/lib/ble/pmd-protocol";

describe("pmd-protocol encode/decode", () => {
  it("encodes start ACC 200 Hz ±8 G 16-bit per spec", () => {
    const bytes = encodeStartAcc({ rate_hz: 200, range_g: 8, resolution_bits: 16 });
    expect(Array.from(bytes)).toEqual([
      0x02, 0x02,
      0x00, 0x01, 0xc8, 0x00,
      0x01, 0x01, 0x10, 0x00,
      0x02, 0x01, 0x08, 0x00,
    ]);
  });

  it("encodes start ECG 130 Hz 14-bit per spec", () => {
    const bytes = encodeStartEcg({ rate_hz: 130, resolution_bits: 14 });
    expect(Array.from(bytes)).toEqual([
      0x02, 0x00,
      0x00, 0x01, 0x82, 0x00,
      0x01, 0x01, 0x0e, 0x00,
    ]);
  });

  it("encodes STOP ACC and STOP ECG", () => {
    expect(Array.from(encodeStop(MEAS_TYPE_ACC))).toEqual([0x03, 0x02]);
    expect(Array.from(encodeStop(MEAS_TYPE_ECG))).toEqual([0x03, 0x00]);
  });

  it("parses a SUCCESS control response", () => {
    const view = new DataView(new Uint8Array([0xf0, 0x02, 0x02, 0x00, 0x00, 0x00]).buffer);
    const resp = parseControlResponse(view);
    expect(resp.ok).toBe(true);
    expect(resp.errorCode).toBe(PMD_ERROR_CODES.SUCCESS);
    expect(resp.errorName).toBe("SUCCESS");
    expect(resp.responseToOp).toBe(0x02);
    expect(resp.measType).toBe(0x02);
  });

  it("parses an ALREADY_IN_STATE error response", () => {
    const view = new DataView(new Uint8Array([0xf0, 0x02, 0x02, 0x06]).buffer);
    const resp = parseControlResponse(view);
    expect(resp.ok).toBe(false);
    expect(resp.errorCode).toBe(PMD_ERROR_CODES.ALREADY_IN_STATE);
    expect(resp.errorName).toBe("ALREADY_IN_STATE");
  });

  it("parses a DEVICE_IN_CHARGER error response", () => {
    const view = new DataView(new Uint8Array([0xf0, 0x02, 0x00, 0x0d]).buffer);
    const resp = parseControlResponse(view);
    expect(resp.ok).toBe(false);
    expect(resp.errorName).toBe("DEVICE_IN_CHARGER");
  });

  it("throws when the control response is shorter than 4 bytes", () => {
    const view = new DataView(new Uint8Array([0xf0, 0x02, 0x02]).buffer);
    expect(() => parseControlResponse(view)).toThrow(/too short/);
  });

  it("maps unknown error codes to a hex-suffixed UNKNOWN label", () => {
    expect(pmdErrorName(0xff)).toBe("UNKNOWN_ff");
  });
});
