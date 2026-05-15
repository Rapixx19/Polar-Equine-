// Pure ACC signal primitives shared by the gait classifier and (later) the
// jump/impact detector. Kept tiny + dependency-free so the test suite can
// fuzz them without pulling in the full classifier.

export type AccSample = { ts_ms: number; ax: number; ay: number; az: number };

export function magnitudeSeries(samples: AccSample[]): number[] {
  const out = new Array<number>(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    out[i] = Math.hypot(s.ax, s.ay, s.az);
  }
  return out;
}

export function mean(values: ArrayLike<number>): number {
  if (values.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < values.length; i++) s += values[i];
  return s / values.length;
}

export function detrend(values: number[]): number[] {
  if (values.length === 0) return [];
  const m = mean(values);
  return values.map((v) => v - m);
}

export function rms(values: ArrayLike<number>): number {
  if (values.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < values.length; i++) s += values[i] * values[i];
  return Math.sqrt(s / values.length);
}

export function estimateSampleHz(samples: AccSample[]): number {
  if (samples.length < 2) return 200;
  const spanMs = samples[samples.length - 1].ts_ms - samples[0].ts_ms;
  if (spanMs <= 0) return 200;
  return ((samples.length - 1) / spanMs) * 1000;
}
