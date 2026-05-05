// Decoder for the standard Bluetooth GATT Heart Rate Measurement characteristic (0x2A37).
// Spec: org.bluetooth.characteristic.heart_rate_measurement (Bluetooth SIG GATT Specifications).
// Frame layout: 1 byte flags, then HR (1 or 2 bytes per flags bit 0), then optional energy
// expended (uint16 LE, 2 bytes, present when flags bit 3 set), then 0..N R-R interval pairs
// (uint16 LE, units of 1/1024 s, present when flags bit 4 set).

export type HRSample = {
  hr_bpm: number;
  contact: "unsupported" | "no_contact" | "contact";
  energy_kj?: number;
  rr_ms: number[];
  received_at: number;
};

const RR_TICKS_PER_SECOND = 1024;

export function decodeHR(view: DataView): HRSample {
  if (view.byteLength < 2) {
    throw new Error(`HR frame too short: ${view.byteLength} bytes`);
  }

  const flags = view.getUint8(0);
  const hrIs16Bit = (flags & 0x01) !== 0;
  const contactBits = (flags >> 1) & 0x03;
  const energyPresent = (flags & 0x08) !== 0;
  const rrPresent = (flags & 0x10) !== 0;

  let offset = 1;
  const hr_bpm = hrIs16Bit ? view.getUint16(offset, true) : view.getUint8(offset);
  offset += hrIs16Bit ? 2 : 1;

  let energy_kj: number | undefined;
  if (energyPresent) {
    if (offset + 2 > view.byteLength) {
      throw new Error("HR frame truncated before energy field");
    }
    energy_kj = view.getUint16(offset, true);
    offset += 2;
  }

  const rr_ms: number[] = [];
  if (rrPresent) {
    while (offset + 2 <= view.byteLength) {
      const ticks = view.getUint16(offset, true);
      rr_ms.push((ticks * 1000) / RR_TICKS_PER_SECOND);
      offset += 2;
    }
  }

  return {
    hr_bpm,
    contact: contactToLabel(contactBits),
    energy_kj,
    rr_ms,
    received_at: Date.now(),
  };
}

function contactToLabel(bits: number): HRSample["contact"] {
  if (bits === 2) return "no_contact";
  if (bits === 3) return "contact";
  return "unsupported";
}
