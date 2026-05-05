import type { HRSample } from "@/lib/ble/hr-codec";

type StreamOptions = {
  count: number;
  baseRrMs?: number;        // baseline RR in ms; default 800 (75 bpm)
  correctionPct?: number;   // fraction of beats that exceed 20% relative jump
  contact?: HRSample["contact"];
};

// Builds a deterministic synthetic HR stream for hook tests.
// Inserts a +21% jump every 1/correctionPct beats so the Lipponen-Tarvainen
// first-pass gate fires at the requested rate. Other beats are flat — keeps
// the math obvious in test assertions.
export function buildHrStream(opts: StreamOptions): HRSample[] {
  const base = opts.baseRrMs ?? 800;
  const contact = opts.contact ?? "contact";
  const correctionPct = opts.correctionPct ?? 0;
  const correctEvery =
    correctionPct > 0 ? Math.max(1, Math.round(1 / correctionPct)) : Infinity;
  const samples: HRSample[] = [];
  let rr = base;
  for (let i = 0; i < opts.count; i++) {
    rr = i > 0 && i % correctEvery === 0 ? Math.round(base * 1.21) : base;
    samples.push({
      hr_bpm: Math.round(60000 / rr),
      rr_ms: [rr],
      contact,
      received_at: i * rr,
    });
  }
  return samples;
}
