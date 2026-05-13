// Pure data-gap analyzer for the research-progress dashboard (Slice 15.B / 16).
//
// The research program needs a spread of gaits, not just whatever the rider
// happens to do most. This module compares what the rider has *labeled* so
// far (post-review, corrected_label_type) against a target distribution and
// returns the top gaps so the home page can nudge: "you still need 3 canter
// sessions, 1 jumping session."
//
// Defaults are intentionally crude — we'll re-tune from real engagement data.
// Keep this file dependency-free (no Supabase imports) so it's trivially
// testable as a pure function. Callers pass in the aggregated counts.

import type { GaitLabel } from "@/lib/session/segments";

// Target distribution for the default 30-session quota. The non-riding
// gaits (halt/not_sure/jump) are intentionally NOT in the target — halt
// happens naturally inside other sessions and jump is a within-session
// annotation, not a session category.
const TARGET_FRACTIONS: Partial<Record<GaitLabel, number>> = {
  walk: 0.28,
  trot: 0.34,
  canter: 0.26,
  jump: 0.12,
};

export type LabelCounts = Partial<Record<GaitLabel, number>>;

export type Gap = {
  label: GaitLabel;
  needed: number;
  targetSessions: number;
  haveSessions: number;
};

export type GapReport = {
  sessionsApproved: number;
  sessionsTarget: number;
  sessionsRemaining: number;
  gaps: Gap[]; // sorted by `needed` desc; only labels still short of target
  horsesSampled: number;
  gaitCoverage: number; // 0..1 average over target gaits, capped at 1
};

// "Sessions that featured at least one block of label X" is what we count.
// `labelSessionCounts` maps gait → number of distinct sessions where that
// gait appeared. Callers compute it via DISTINCT(session_id) per label.
export function buildGapReport(args: {
  sessionsApproved: number;
  sessionsTarget: number;
  labelSessionCounts: LabelCounts;
  horsesSampled: number;
}): GapReport {
  const { sessionsApproved, sessionsTarget, labelSessionCounts, horsesSampled } = args;

  const gaps: Gap[] = [];
  for (const [label, fraction] of Object.entries(TARGET_FRACTIONS) as Array<
    [GaitLabel, number]
  >) {
    const target = Math.max(1, Math.round(sessionsTarget * fraction));
    const have = labelSessionCounts[label] ?? 0;
    const needed = Math.max(0, target - have);
    if (needed > 0) {
      gaps.push({ label, needed, targetSessions: target, haveSessions: have });
    }
  }
  gaps.sort((a, b) => b.needed - a.needed);

  return {
    sessionsApproved,
    sessionsTarget,
    sessionsRemaining: Math.max(0, sessionsTarget - sessionsApproved),
    gaps,
    horsesSampled,
    gaitCoverage: coverageFraction(labelSessionCounts, sessionsTarget),
  };
}

// Phrasing helpers — kept here so the React component stays presentational.
export function phraseGap(g: Gap): string {
  const noun = g.needed === 1 ? "session" : "sessions";
  return `${g.needed} more ${g.label} ${noun}`;
}

export function phraseProgress(report: GapReport): string {
  if (report.sessionsApproved >= report.sessionsTarget) {
    return "You hit the target! Every extra session still helps.";
  }
  return `${report.sessionsApproved} of ${report.sessionsTarget} sessions logged`;
}

// Variability target for the "horses sampled" ring. Crude default — the
// research program prefers data across multiple horses but doesn't have a
// hard quota yet. 4 is enough to see between-horse contrast without
// punishing single-stable riders.
export const HORSES_VARIETY_TARGET = 4;

// Overall gait coverage — the average of (have / target) across the four
// target gaits, capped at 1.0. Used by the home rings to give the rider
// one scalar for "how diverse is your data so far".
export function coverageFraction(
  labelSessionCounts: LabelCounts,
  sessionsTarget: number,
): number {
  const entries = Object.entries(TARGET_FRACTIONS) as Array<[GaitLabel, number]>;
  if (entries.length === 0) return 0;
  let sum = 0;
  for (const [label, fraction] of entries) {
    const target = Math.max(1, Math.round(sessionsTarget * fraction));
    const have = labelSessionCounts[label] ?? 0;
    sum += Math.min(1, have / target);
  }
  return sum / entries.length;
}
