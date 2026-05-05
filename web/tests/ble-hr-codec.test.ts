import { describe, expect, it } from "vitest";

import { decodeHR } from "@/lib/ble/hr-codec";

function dv(...bytes: number[]): DataView {
  const buf = new Uint8Array(bytes);
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
}

describe("decodeHR", () => {
  it("decodes uint8 HR with no R-R or energy", () => {
    const sample = decodeHR(dv(0x00, 0x48));
    expect(sample.hr_bpm).toBe(72);
    expect(sample.rr_ms).toEqual([]);
    expect(sample.energy_kj).toBeUndefined();
    expect(sample.contact).toBe("unsupported");
  });

  it("decodes uint16 HR (flags bit 0 set)", () => {
    const sample = decodeHR(dv(0x01, 0x48, 0x00));
    expect(sample.hr_bpm).toBe(72);
    expect(sample.rr_ms).toEqual([]);
  });

  it("decodes a single R-R interval (1024 ticks → 1000 ms)", () => {
    const sample = decodeHR(dv(0x10, 0x48, 0x00, 0x04));
    expect(sample.hr_bpm).toBe(72);
    expect(sample.rr_ms).toHaveLength(1);
    expect(sample.rr_ms[0]).toBeCloseTo(1000, 1);
  });

  it("decodes multiple R-R intervals", () => {
    // 0x0400 = 1024 ticks (1000 ms), 0x0500 = 1280 ticks (1250 ms)
    const sample = decodeHR(dv(0x10, 0x48, 0x00, 0x04, 0x00, 0x05));
    expect(sample.rr_ms).toHaveLength(2);
    expect(sample.rr_ms[0]).toBeCloseTo(1000, 1);
    expect(sample.rr_ms[1]).toBeCloseTo(1250, 1);
  });

  it("decodes sensor contact = contact (flags bits 1-2 = 0b11)", () => {
    const sample = decodeHR(dv(0x06, 0x48));
    expect(sample.contact).toBe("contact");
  });

  it("decodes sensor contact = no_contact (flags bits 1-2 = 0b10)", () => {
    const sample = decodeHR(dv(0x04, 0x48));
    expect(sample.contact).toBe("no_contact");
  });

  it("decodes energy expended (flags bit 3 set, kJ uint16 LE)", () => {
    // 0x03E8 = 1000 kJ
    const sample = decodeHR(dv(0x08, 0x48, 0xe8, 0x03));
    expect(sample.energy_kj).toBe(1000);
    expect(sample.rr_ms).toEqual([]);
  });

  it("decodes the full combined frame: uint16 HR + energy + R-R", () => {
    // flags 0x19 = bit 0 (uint16 HR) + bit 3 (energy) + bit 4 (R-R)
    const sample = decodeHR(dv(0x19, 0x48, 0x00, 0xe8, 0x03, 0x00, 0x04));
    expect(sample.hr_bpm).toBe(72);
    expect(sample.energy_kj).toBe(1000);
    expect(sample.rr_ms).toHaveLength(1);
    expect(sample.rr_ms[0]).toBeCloseTo(1000, 1);
  });

  it("throws on a frame too short to hold flags + HR", () => {
    expect(() => decodeHR(dv(0x00))).toThrow(/too short/);
  });

  it("throws when energy field is truncated", () => {
    // flags say energy present, but only 1 byte after HR instead of 2
    expect(() => decodeHR(dv(0x08, 0x48, 0xe8))).toThrow(/truncated/);
  });

  it("ignores a trailing odd byte in the R-R section", () => {
    // 0x0400 is one valid R-R; the trailing 0xff is half a pair → ignored
    const sample = decodeHR(dv(0x10, 0x48, 0x00, 0x04, 0xff));
    expect(sample.rr_ms).toHaveLength(1);
    expect(sample.rr_ms[0]).toBeCloseTo(1000, 1);
  });

  it("populates received_at with a wall-clock timestamp", () => {
    const before = Date.now();
    const sample = decodeHR(dv(0x00, 0x48));
    const after = Date.now();
    expect(sample.received_at).toBeGreaterThanOrEqual(before);
    expect(sample.received_at).toBeLessThanOrEqual(after);
  });
});
