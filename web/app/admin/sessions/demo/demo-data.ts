import type { GaitLabel } from "@/lib/session/segments";

// Synthetic 30-minute jumping-school session. All ids are fixed placeholders
// — the page advertises that the row does not exist in the DB.

const DEMO_SESSION_ID = "00000000-0000-4000-8000-000000000000";
const DURATION_MS = 30 * 60 * 1000;

type Sample = { ts_ms: number; bpm: number };

type Phase = {
  label: GaitLabel;
  start_ms: number;
  end_ms: number;
  jump_count: number;
  hr_start: number;
  hr_end: number;
};

const PHASES: Phase[] = [
  { label: "walk",   start_ms: 0,           end_ms: 5 * 60_000,  jump_count: 0, hr_start: 62,  hr_end: 82 },
  { label: "trot",   start_ms: 5 * 60_000,  end_ms: 11 * 60_000, jump_count: 0, hr_start: 95,  hr_end: 128 },
  { label: "canter", start_ms: 11 * 60_000, end_ms: 17 * 60_000, jump_count: 0, hr_start: 135, hr_end: 168 },
  { label: "jump",   start_ms: 17 * 60_000, end_ms: 22 * 60_000, jump_count: 4, hr_start: 162, hr_end: 184 },
  { label: "trot",   start_ms: 22 * 60_000, end_ms: 27 * 60_000, jump_count: 0, hr_start: 142, hr_end: 110 },
  { label: "walk",   start_ms: 27 * 60_000, end_ms: 30 * 60_000, jump_count: 0, hr_start: 96,  hr_end: 68 },
];

function buildSamples(): Sample[] {
  const samples: Sample[] = [];
  // 1 Hz, deterministic noise so the chart looks the same every reload.
  let seed = 7;
  const rng = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (const phase of PHASES) {
    const startS = Math.floor(phase.start_ms / 1000);
    const endS = Math.floor(phase.end_ms / 1000);
    for (let s = startS; s < endS; s += 1) {
      const t = (s - startS) / (endS - startS);
      const trend = phase.hr_start + (phase.hr_end - phase.hr_start) * t;
      const wobble = (rng() - 0.5) * 6;
      const jumpSpike =
        phase.label === "jump" && s % 75 < 4 ? 8 + rng() * 6 : 0;
      const bpm = Math.round(trend + wobble + jumpSpike);
      samples.push({ ts_ms: s * 1000, bpm });
    }
  }
  return samples;
}

const SAMPLES = buildSamples();

const LABELS = PHASES.map((p) => ({
  start_ms: p.start_ms,
  end_ms: p.end_ms,
  label: p.label,
  jump_count: p.jump_count,
  correction_kind: "approved",
}));

const METRICS: Record<string, unknown> = {
  duration_s: DURATION_MS / 1000,
  hr_avg: 118,
  hr_peak: 188,
  hr_min: 58,
  hr_sd: 28.4,
  rmssd_ms: 32.1,
  sdnn_ms: 64.7,
  pnn50_pct: 11.8,
  trimp_banister: 84.2,
  recovery_tau_s: 462,
  time_walk_s: 8 * 60,
  time_trot_s: 11 * 60,
  time_canter_s: 6 * 60,
  time_gallop_s: 0,
  time_rest_s: 5 * 60,
  jump_count: 4,
  time_z1_s: 380,
  time_z2_s: 540,
  time_z3_s: 480,
  time_z4_s: 280,
  time_z5_s: 120,
  algo_version: "0.3.1",
};

const DEMO_INSIGHT_MARKDOWN = [
  "This was a structured 30-minute schooling session that built from a calm 5-minute walk warm-up through sustained trot and canter into a focused jumping block of four fences, then unwound through a cooldown trot back to walk. The heart-rate trace tracks the rider-confirmed gait blocks cleanly — each transition lifts the trend a clear 15–35 bpm without large overshoots, which suggests the warm-up was paced rather than rushed.",
  "Physiologically the picture looks healthy. Average HR sat at 118 bpm with a peak of 188 inside the jump block, and Z2/Z3 dominate at ~17 minutes combined — characteristic of moderate aerobic schooling rather than a hard conditioning ride. RMSSD at 32 ms and SDNN at 65 ms are inside the normal range for a working horse mid-session; the recovery τ of ~7.7 minutes is on the brisker side, consistent with a fit horse that wasn't pushed near its ceiling.",
  "Two small follow-ups. First, the spike around minute 19 inside the jump block touches 188 — if that's repeatable on subsequent jumping days, worth checking whether it lines up with a specific fence (height, line, or approach). Second, the cooldown trot is short relative to the canter+jump load above it; lengthening it by 2–3 minutes on the next equivalent session would likely pull the post-ride recovery τ down further.",
].join("\n\n");

const INITIAL_INSIGHT = {
  markdown: DEMO_INSIGHT_MARKDOWN,
  model: "claude-sonnet-4-6",
  prompt_version: "v1",
  input_tokens: 612,
  output_tokens: 248,
  generated_at: new Date(Date.now() - 25 * 60_000).toISOString(),
  cached: true as const,
};

const SOURCE_COUNTS = {
  samples_hr: SAMPLES.length,
  samples_acc: 0,
  samples_ecg: 0,
  labels_auto: LABELS.length,
  label_corrections: LABELS.length,
  session_metrics: 1,
};

export function buildDemoSession() {
  const started = new Date(Date.now() - DURATION_MS - 5 * 60_000);
  return {
    sessionId: DEMO_SESSION_ID,
    header: {
      rider_name: "Maria Bianchi",
      horse_name: "Belmonte",
      started: started.toLocaleString(),
      duration: "30 min",
      activity: "Riding · Light jumping",
      status: "approved",
    },
    samples: SAMPLES,
    labels: LABELS,
    metrics: METRICS,
    durationMs: DURATION_MS,
    initialInsight: INITIAL_INSIGHT,
    sourceCounts: SOURCE_COUNTS,
  };
}
