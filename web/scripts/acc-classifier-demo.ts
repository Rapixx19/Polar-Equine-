// Demo runner for the ACC stride-frequency classifier.
// Run from web/: npx tsx scripts/acc-classifier-demo.ts

import {
  ACC_CLASSIFIER_ALGO_VERSION,
  classifySessionAcc,
} from "../lib/session/acc-classifier";
import type { AccSample } from "../lib/session/acc-magnitude";

const SAMPLE_HZ = 200;
const PERIOD_MS = 1000 / SAMPLE_HZ;

function sine(freqHz: number, durationMs: number, amplitude = 0.35): AccSample[] {
  const out: AccSample[] = [];
  const n = Math.round(durationMs / PERIOD_MS);
  for (let i = 0; i < n; i++) {
    const t = i * PERIOD_MS;
    const phase = 2 * Math.PI * freqHz * (t / 1000);
    out.push({ ts_ms: t, ax: 0, ay: 0, az: 1 + amplitude * Math.sin(phase) });
  }
  return out;
}

function flat(durationMs: number, mag = 1): AccSample[] {
  const out: AccSample[] = [];
  const n = Math.round(durationMs / PERIOD_MS);
  for (let i = 0; i < n; i++) out.push({ ts_ms: i * PERIOD_MS, ax: 0, ay: 0, az: mag });
  return out;
}

function concat(...chunks: AccSample[][]): AccSample[] {
  const out: AccSample[] = [];
  let offset = 0;
  for (const chunk of chunks) {
    if (chunk.length === 0) continue;
    const lastTs = chunk[chunk.length - 1].ts_ms;
    for (const s of chunk) out.push({ ...s, ts_ms: s.ts_ms + offset });
    offset += lastTs + PERIOD_MS;
  }
  return out;
}

function ms(t: number): string {
  const m = Math.floor(t / 60_000);
  const s = Math.round((t % 60_000) / 1000);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function show(title: string, samples: AccSample[], durationMs: number): void {
  const segs = classifySessionAcc(samples, durationMs);
  console.log(`\n=== ${title} ===`);
  console.log(
    `samples=${samples.length}  duration=${ms(durationMs)}  algo=${ACC_CLASSIFIER_ALGO_VERSION}`,
  );
  if (segs.length === 0) {
    console.log("  (no segments)");
    return;
  }
  console.log("  start    end      label      stride_hz  conf");
  console.log("  -------  -------  ---------  ---------  -----");
  for (const s of segs) {
    console.log(
      `  ${ms(s.start_ms).padStart(7)}  ${ms(s.end_ms).padStart(7)}  ${s.label.padEnd(9)}  ${s.stride_hz
        .toFixed(2)
        .padStart(9)}  ${s.confidence.toFixed(2).padStart(5)}`,
    );
  }
}

show("Scenario 1 — pure walk (1.2 Hz, 30 s)", sine(1.2, 30_000), 30_000);
show("Scenario 2 — pure trot (2.6 Hz, 30 s)", sine(2.6, 30_000), 30_000);
show("Scenario 3 — pure canter (4.0 Hz, 30 s)", sine(4.0, 30_000), 30_000);
show("Scenario 4 — halt (flat 1 g, 30 s)", flat(30_000), 30_000);
show(
  "Scenario 5 — three-gait ride (walk → trot → canter, 30 s each)",
  concat(sine(1.2, 30_000), sine(2.6, 30_000), sine(4.0, 30_000)),
  90_000,
);
show(
  "Scenario 6 — walk with a short canter blip (should merge away)",
  concat(sine(1.2, 20_000), sine(4.0, 2_000), sine(1.2, 20_000)),
  42_000,
);
