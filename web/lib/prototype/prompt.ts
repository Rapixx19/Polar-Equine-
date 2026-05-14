// Prompt construction for the prototype-vs-baseline comparison insight.
// Pure / no I/O. Takes the two BucketAggregates and asks Claude for a
// short, blunt verdict: is the prototype better, worse, or the same as
// the bare strap, on each quality signal we measure?

import type { ComparisonAggregate } from "./aggregate";

export const PROMPT_VERSION = "v1";
export const MODEL = "claude-sonnet-4-6";
export const MAX_OUTPUT_TOKENS = 600;

function fmt(n: number | null, digits = 2, unit = ""): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const s = digits === 0 ? Math.round(n).toString() : n.toFixed(digits);
  return unit ? `${s} ${unit}` : s;
}

export function buildComparisonPrompt(input: ComparisonAggregate): string {
  const { baseline, prototype } = input;
  const data = [
    "Quality signals — baseline (bare strap) vs prototype (girth mount):",
    "",
    `Sessions counted: baseline=${baseline.session_count}, prototype=${prototype.session_count}`,
    `Total ride time (min): baseline=${fmt(baseline.total_duration_min, 1)}, prototype=${fmt(prototype.total_duration_min, 1)}`,
    `Avg ride duration (min): baseline=${fmt(baseline.avg_duration_min, 1)}, prototype=${fmt(prototype.avg_duration_min, 1)}`,
    "",
    "Signal stability (lower is better):",
    `- Bad-signal seconds per minute: baseline=${fmt(baseline.signal_event_seconds_per_min, 2)}, prototype=${fmt(prototype.signal_event_seconds_per_min, 2)}`,
    `- Avg weak/lost events per session: baseline=${fmt(baseline.avg_signal_events_per_session, 2)}, prototype=${fmt(prototype.avg_signal_events_per_session, 2)}`,
    "",
    "Computed quality scores (0–1, higher is better):",
    `- RR cleaning quality: baseline=${fmt(baseline.avg_rr_cleaning_quality, 2)}, prototype=${fmt(prototype.avg_rr_cleaning_quality, 2)}`,
    `- HRV completeness: baseline=${fmt(baseline.avg_hrv_completeness_quality, 2)}, prototype=${fmt(prototype.avg_hrv_completeness_quality, 2)}`,
    `- Workload quality: baseline=${fmt(baseline.avg_workload_quality, 2)}, prototype=${fmt(prototype.avg_workload_quality, 2)}`,
    "",
    `HR samples per minute (higher = fewer dropouts): baseline=${fmt(baseline.avg_hr_samples_per_min, 1)}, prototype=${fmt(prototype.avg_hr_samples_per_min, 1)}`,
  ].join("\n");

  return [
    "You are comparing two configurations of an equine heart-rate sensor:",
    "BASELINE = the bare Polar H10 girth strap.",
    "PROTOTYPE = the same H10 inside an experimental girth-mount holder we're testing.",
    "",
    "Data collection is identical. Sessions are tagged at start time; the rider",
    "manually opted in to the prototype on a checkbox. Same horses, same riders,",
    "same activities.",
    "",
    "Write TWO short paragraphs in plain prose (no markdown headers, no lists):",
    "1) Verdict — does the prototype look BETTER, WORSE, or ABOUT THE SAME than the bare strap on data quality? Be direct. Name the strongest signal driving the verdict.",
    "2) Caveats and what to do next — call out small sample sizes, missing fields, or single-rider effects honestly. Suggest one concrete next step (e.g. record N more sessions, focus on a specific gait).",
    "",
    "Rules:",
    "- Do NOT invent numbers that aren't in the data block.",
    "- If either bucket has fewer than 3 sessions, lead the verdict with 'too early to tell' and stick to descriptive comparison only.",
    "- Keep it under 200 words total.",
    "",
    "--- DATA ---",
    data,
  ].join("\n");
}
