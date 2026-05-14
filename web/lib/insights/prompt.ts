// Pure prompt construction for per-session Claude insights.
// No I/O — kept testable in isolation. The prompt is intentionally
// terse: three short paragraphs in plain prose, no markdown headers,
// no measurements that weren't passed in.

export const MODEL = "claude-sonnet-4-6";
export const PROMPT_VERSION = "v1";
export const MAX_OUTPUT_TOKENS = 600;

export type LabelSummary = {
  label: string;
  total_ms: number;
  jump_count: number;
};

export type InsightInput = {
  activity_type: string;
  started_at: string;
  duration_ms: number | null;
  metrics: Record<string, unknown> | null;
  labels: LabelSummary[];
  hr_summary: {
    avg: number | null;
    peak: number | null;
    min: number | null;
    time_z1_s?: number | null;
    time_z2_s?: number | null;
    time_z3_s?: number | null;
    time_z4_s?: number | null;
    time_z5_s?: number | null;
  };
};

function fmt(n: unknown, digits = 1, unit = ""): string {
  if (n == null) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  const s = digits === 0 ? Math.round(v).toString() : v.toFixed(digits);
  return unit ? `${s} ${unit}` : s;
}

function durationMin(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "—";
  return `${Math.round(ms / 60_000)} min`;
}

function labelLine(l: LabelSummary): string {
  const mins = (l.total_ms / 60_000).toFixed(1);
  return `- ${l.label}: ${mins} min, ${l.jump_count} jumps`;
}

export function buildInsightPrompt(input: InsightInput): string {
  const m = input.metrics ?? {};
  const hr = input.hr_summary;
  const lines = [
    `Activity: ${input.activity_type}`,
    `Started: ${input.started_at}`,
    `Duration: ${durationMin(input.duration_ms)}`,
    "",
    "Heart rate:",
    `- avg: ${fmt(hr.avg, 0, "bpm")}`,
    `- peak: ${fmt(hr.peak, 0, "bpm")}`,
    `- min: ${fmt(hr.min, 0, "bpm")}`,
    `- time in Z1–Z5 (s): ${fmt(hr.time_z1_s, 0)} / ${fmt(hr.time_z2_s, 0)} / ${fmt(hr.time_z3_s, 0)} / ${fmt(hr.time_z4_s, 0)} / ${fmt(hr.time_z5_s, 0)}`,
    "",
    "HRV / load:",
    `- RMSSD: ${fmt(m.rmssd_ms, 1, "ms")}`,
    `- SDNN: ${fmt(m.sdnn_ms, 1, "ms")}`,
    `- pNN50: ${fmt(m.pnn50_pct, 1, "%")}`,
    `- TRIMP (Banister): ${fmt(m.trimp_banister, 1)}`,
    `- recovery τ: ${fmt(m.recovery_tau_s, 0, "s")}`,
    "",
    "Label blocks (rider-confirmed):",
    ...input.labels.map(labelLine),
  ];
  const data = lines.join("\n");
  return [
    "You are reviewing a single equine training session, summarised below.",
    "Write THREE short paragraphs in plain prose (no markdown headers, no lists):",
    "1) Overall character of the ride — gait mix, intensity, anything notable.",
    "2) Physiology highlights — what the HR + HRV picture suggests.",
    "3) One or two follow-up suggestions for the rider, grounded in the data.",
    "",
    "Constraints:",
    "- Do not name the rider or horse — names are not provided.",
    "- Do not invent measurements that are not in the data block.",
    "- Keep it tight — under 220 words total.",
    "",
    "--- SESSION DATA ---",
    data,
  ].join("\n");
}
