// Server-side data fetch for the research-progress dashboard. Pulls everything
// the home page needs in one place so the page itself stays declarative.
//
// Defensive on schema: if migration 023 hasn't been applied yet, we fall back
// to DEFAULT_QUOTA_TARGET / no program end date instead of crashing. Lets the
// home redesign ship and gracefully upgrade once the columns exist.

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildGapReport, type GapReport, type LabelCounts } from "@/lib/research/gap-analyzer";
import type { GaitLabel } from "@/lib/session/segments";
// We intentionally do NOT thread Database generics through here. The supabase
// generated types are regenerated each time the schema changes, and the
// progress fetcher reads defensively across columns that may or may not exist
// yet (migration 023). Threading the generics would force the caller to keep
// the type cast in sync, which is more friction than the safety is worth.

export const DEFAULT_QUOTA_TARGET = 30;

export type ProgressContext = {
  report: GapReport;
  programEndDate: string | null;
  daysRemaining: number | null;
  // Average rr_cleaning_quality across the rider's sessions that have
  // metrics computed (0..1, where 1.0 means no beats were corrected). null
  // when there are no rows yet — UI shows a placeholder instead of "0".
  avgDataQuality: number | null;
  dataQualitySampleSize: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

async function readQuota(supabase: Supa, userId: string): Promise<{
  target: number;
  endDate: string | null;
}> {
  try {
    const { data } = await supabase
      .from("rider_profiles")
      // The columns may not exist yet in the generated types — we typecast
      // through `any` and read defensively to keep the page rendering before
      // migration 023 lands.
      .select("session_quota_target, program_end_date" as never)
      .eq("id", userId)
      .maybeSingle();
    const row = (data ?? {}) as {
      session_quota_target?: number | null;
      program_end_date?: string | null;
    };
    return {
      target: row.session_quota_target ?? DEFAULT_QUOTA_TARGET,
      endDate: row.program_end_date ?? null,
    };
  } catch {
    return { target: DEFAULT_QUOTA_TARGET, endDate: null };
  }
}

async function readApprovedSessionsCount(supabase: Supa, userId: string): Promise<number> {
  const { count } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("rider_id", userId)
    .eq("status", "approved");
  return count ?? 0;
}

async function readHorsesSampled(supabase: Supa, userId: string): Promise<number> {
  const { data } = await supabase
    .from("sessions")
    .select("horse_id")
    .eq("rider_id", userId)
    .eq("status", "approved");
  if (!data) return 0;
  return new Set(data.map((r) => r.horse_id)).size;
}

async function readAvgDataQuality(
  supabase: Supa,
  userId: string,
): Promise<{ avg: number | null; n: number }> {
  // session_metrics is joined via the session row so RLS on sessions
  // governs visibility. We average rr_cleaning_quality across all of the
  // rider's metric rows (any status — non-approved sessions still produce
  // valid quality numbers and are useful here as "how clean is my data
  // when I record"). Null/missing rows are dropped.
  const { data } = await supabase
    .from("session_metrics")
    .select("rr_cleaning_quality, sessions!inner(rider_id)")
    .eq("sessions.rider_id", userId);
  if (!data || data.length === 0) return { avg: null, n: 0 };
  const numbers = (data as Array<{ rr_cleaning_quality: number | null }>)
    .map((r) => r.rr_cleaning_quality)
    .filter((q): q is number => typeof q === "number" && Number.isFinite(q));
  if (numbers.length === 0) return { avg: null, n: 0 };
  const sum = numbers.reduce((a, b) => a + b, 0);
  return { avg: sum / numbers.length, n: numbers.length };
}

async function readLabelSessionCounts(
  supabase: Supa,
  userId: string,
): Promise<LabelCounts> {
  // One row per (session_id, label) — Postgres groups across multiple
  // corrected blocks of the same label within a session. Then we count
  // distinct session_ids per label client-side; cheaper than DISTINCT in SQL
  // for our scale, and avoids needing a Postgres RPC.
  const { data } = await supabase
    .from("label_corrections")
    .select("session_id, corrected_label_type")
    .eq("rider_id", userId);
  if (!data) return {};

  const seen: Partial<Record<GaitLabel, Set<string>>> = {};
  for (const row of data as Array<{ session_id: string; corrected_label_type: GaitLabel }>) {
    const set = seen[row.corrected_label_type] ?? new Set<string>();
    set.add(row.session_id);
    seen[row.corrected_label_type] = set;
  }
  const out: LabelCounts = {};
  for (const [label, set] of Object.entries(seen) as Array<[GaitLabel, Set<string>]>) {
    out[label] = set.size;
  }
  return out;
}

function daysBetween(fromIso: string, toDate: Date): number {
  const from = new Date(fromIso).getTime();
  if (!Number.isFinite(from)) return 0;
  const ms = from - toDate.getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export async function fetchProgressContext(
  supabase: Supa,
  userId: string,
  now: Date = new Date(),
): Promise<ProgressContext> {
  const [quota, sessionsApproved, horsesSampled, labelCounts, quality] =
    await Promise.all([
      readQuota(supabase, userId),
      readApprovedSessionsCount(supabase, userId),
      readHorsesSampled(supabase, userId),
      readLabelSessionCounts(supabase, userId),
      readAvgDataQuality(supabase, userId),
    ]);

  const report = buildGapReport({
    sessionsApproved,
    sessionsTarget: quota.target,
    labelSessionCounts: labelCounts,
    horsesSampled,
  });

  return {
    report,
    programEndDate: quota.endDate,
    daysRemaining: quota.endDate ? daysBetween(quota.endDate, now) : null,
    avgDataQuality: quality.avg,
    dataQualitySampleSize: quality.n,
  };
}
