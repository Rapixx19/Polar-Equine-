// Pure reducers powering the redesigned /admin dashboard.
//
// Given the raw rider + session + metric rows fetched on the server, build
// the per-rider rollup (sessions, % of dataset, prototype count, avg quality,
// 14-day sparkline) and the study-wide KPI strip.
//
// No I/O. Imported by /admin/page.tsx and the unit tests.

export type DashboardSessionRow = {
  rider_id: string;
  start_time: string;
  end_time: string | null;
  has_prototype_mount: boolean;
  rr_cleaning_quality: number | null;
  hrv_completeness_quality: number | null;
  workload_quality: number | null;
};

export type DashboardRiderProfile = {
  id: string;
  display_name: string;
  is_admin: boolean | null;
  session_quota_target: number;
  program_end_date: string | null;
  admin_notes: string | null;
  next_focus: string | null;
  created_at: string | null;
};

export type RiderRollup = {
  id: string;
  display_name: string;
  is_admin: boolean;
  session_quota_target: number;
  program_end_date: string | null;
  admin_notes: string | null;
  next_focus: string | null;
  session_count: number;
  total_ride_minutes: number;
  last_session_at: string | null;
  prototype_session_count: number;
  avg_quality: number | null; // mean of (rr * hrv * workload), nulls dropped
  pct_of_dataset: number; // 0..1, share of total ride minutes
  daily_sessions: number[]; // length 14, oldest first, today last
  active_last_7d: boolean;
};

export type DashboardKpis = {
  rider_count: number;
  total_sessions: number;
  total_ride_hours: number;
  active_riders_7d: number;
  prototype_share: number | null; // 0..1, null if total_sessions === 0
  avg_quality: number | null;
};

function durationMinutes(start: string, end: string | null): number {
  if (!end) return 0;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms / 60_000 : 0;
}

function sessionQuality(row: DashboardSessionRow): number | null {
  const parts = [
    row.rr_cleaning_quality,
    row.hrv_completeness_quality,
    row.workload_quality,
  ].filter((x): x is number => x != null && Number.isFinite(x));
  if (parts.length === 0) return null;
  return parts.reduce((s, x) => s + x, 0) / parts.length;
}

function dayKey(d: Date): string {
  // Local-date key (YYYY-MM-DD) so the sparkline aligns to the admin's day.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildDailyBuckets(now: Date, sessionDates: Date[]): number[] {
  // 14 buckets, oldest first. Index 13 is "today".
  const counts: number[] = Array.from({ length: 14 }, () => 0);
  const keys: string[] = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (13 - i));
    return dayKey(d);
  });
  const keyToIdx = new Map(keys.map((k, i) => [k, i]));
  for (const d of sessionDates) {
    const idx = keyToIdx.get(dayKey(d));
    if (idx !== undefined) counts[idx] += 1;
  }
  return counts;
}

export function buildRiderRollups(
  profiles: DashboardRiderProfile[],
  sessions: DashboardSessionRow[],
  now: Date = new Date(),
): RiderRollup[] {
  // Total ride minutes across all riders — denominator for pct_of_dataset.
  let totalMinutes = 0;
  for (const s of sessions) totalMinutes += durationMinutes(s.start_time, s.end_time);

  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  const byRider = new Map<string, DashboardSessionRow[]>();
  for (const s of sessions) {
    const cur = byRider.get(s.rider_id);
    if (cur) cur.push(s);
    else byRider.set(s.rider_id, [s]);
  }

  return profiles.map((p) => {
    const rs = byRider.get(p.id) ?? [];
    let riderMinutes = 0;
    let prototypeCount = 0;
    let lastSessionTs = -Infinity;
    let activeLast7 = false;
    const qualityScores: number[] = [];
    const sessionDates: Date[] = [];
    for (const s of rs) {
      riderMinutes += durationMinutes(s.start_time, s.end_time);
      if (s.has_prototype_mount) prototypeCount += 1;
      const startMs = new Date(s.start_time).getTime();
      if (Number.isFinite(startMs)) {
        if (startMs > lastSessionTs) lastSessionTs = startMs;
        if (startMs >= sevenDaysAgo) activeLast7 = true;
        sessionDates.push(new Date(startMs));
      }
      const q = sessionQuality(s);
      if (q != null) qualityScores.push(q);
    }
    return {
      id: p.id,
      display_name: p.display_name,
      is_admin: p.is_admin === true,
      session_quota_target: p.session_quota_target,
      program_end_date: p.program_end_date,
      admin_notes: p.admin_notes,
      next_focus: p.next_focus,
      session_count: rs.length,
      total_ride_minutes: Math.round(riderMinutes * 10) / 10,
      last_session_at: Number.isFinite(lastSessionTs) ? new Date(lastSessionTs).toISOString() : null,
      prototype_session_count: prototypeCount,
      avg_quality:
        qualityScores.length === 0
          ? null
          : qualityScores.reduce((s, x) => s + x, 0) / qualityScores.length,
      pct_of_dataset: totalMinutes > 0 ? riderMinutes / totalMinutes : 0,
      daily_sessions: buildDailyBuckets(now, sessionDates),
      active_last_7d: activeLast7,
    };
  });
}

export function buildKpis(rollups: RiderRollup[], sessions: DashboardSessionRow[]): DashboardKpis {
  const totalSessions = sessions.length;
  let totalMinutes = 0;
  let prototype = 0;
  const qualities: number[] = [];
  for (const s of sessions) {
    totalMinutes += durationMinutes(s.start_time, s.end_time);
    if (s.has_prototype_mount) prototype += 1;
    const q = sessionQuality(s);
    if (q != null) qualities.push(q);
  }
  return {
    rider_count: rollups.length,
    total_sessions: totalSessions,
    total_ride_hours: Math.round((totalMinutes / 60) * 10) / 10,
    active_riders_7d: rollups.filter((r) => r.active_last_7d).length,
    prototype_share: totalSessions === 0 ? null : prototype / totalSessions,
    avg_quality:
      qualities.length === 0 ? null : qualities.reduce((s, x) => s + x, 0) / qualities.length,
  };
}

export function sortRollupsByActivity(rollups: RiderRollup[]): RiderRollup[] {
  // Most-recent session first; riders who have never recorded sink to the bottom,
  // alphabetised among themselves so order is stable across reloads.
  return [...rollups].sort((a, b) => {
    if (a.last_session_at && b.last_session_at) {
      return b.last_session_at.localeCompare(a.last_session_at);
    }
    if (a.last_session_at) return -1;
    if (b.last_session_at) return 1;
    return a.display_name.localeCompare(b.display_name);
  });
}
