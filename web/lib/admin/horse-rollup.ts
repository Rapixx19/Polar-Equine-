// Pure reducers for the per-horse research-objectives section of /admin.
//
// Given the raw horse rows + session rows (with horse_id) fetched on the
// server, build the per-horse rollup (sessions, ride minutes, target progress,
// last activity) and the study-wide objective KPIs.
//
// No I/O. Imported by /admin/page.tsx and the unit tests.

export type HorseSessionRow = {
  horse_id: string | null;
  start_time: string;
  end_time: string | null;
};

export type HorseProfile = {
  id: string;
  name: string;
  target_session_count: number | null;
  target_ride_minutes: number | null;
  admin_notes: string | null;
};

export type HorseRollup = {
  id: string;
  name: string;
  target_session_count: number | null;
  target_ride_minutes: number | null;
  admin_notes: string | null;
  session_count: number;
  total_ride_minutes: number;
  last_session_at: string | null;
  active_last_7d: boolean;
  session_pct: number | null; // 0..1+ (>1 means past target), null when no target
  minutes_pct: number | null; // 0..1+, null when no target
};

export type HorseKpis = {
  horse_count: number;
  horses_with_objectives: number;
  // Aggregate over horses that have *that* target set.
  // sum(actual) / sum(target) — capped per-horse at 1 so a single overachiever
  // doesn't mask laggards in the overall figure.
  session_progress: number | null;
  minutes_progress: number | null;
};

function durationMinutes(start: string, end: string | null): number {
  if (!end) return 0;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms / 60_000 : 0;
}

export function buildHorseRollups(
  horses: HorseProfile[],
  sessions: HorseSessionRow[],
  now: Date = new Date(),
): HorseRollup[] {
  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  const byHorse = new Map<string, HorseSessionRow[]>();
  for (const s of sessions) {
    if (!s.horse_id) continue;
    const cur = byHorse.get(s.horse_id);
    if (cur) cur.push(s);
    else byHorse.set(s.horse_id, [s]);
  }

  return horses.map((h) => {
    const ss = byHorse.get(h.id) ?? [];
    let minutes = 0;
    let lastTs = -Infinity;
    let activeLast7 = false;
    for (const s of ss) {
      minutes += durationMinutes(s.start_time, s.end_time);
      const startMs = new Date(s.start_time).getTime();
      if (Number.isFinite(startMs)) {
        if (startMs > lastTs) lastTs = startMs;
        if (startMs >= sevenDaysAgo) activeLast7 = true;
      }
    }
    const sessionPct =
      h.target_session_count != null && h.target_session_count > 0
        ? ss.length / h.target_session_count
        : null;
    const minutesPct =
      h.target_ride_minutes != null && h.target_ride_minutes > 0
        ? minutes / h.target_ride_minutes
        : null;
    return {
      id: h.id,
      name: h.name,
      target_session_count: h.target_session_count,
      target_ride_minutes: h.target_ride_minutes,
      admin_notes: h.admin_notes,
      session_count: ss.length,
      total_ride_minutes: Math.round(minutes * 10) / 10,
      last_session_at: Number.isFinite(lastTs) ? new Date(lastTs).toISOString() : null,
      active_last_7d: activeLast7,
      session_pct: sessionPct,
      minutes_pct: minutesPct,
    };
  });
}

export function buildHorseKpis(rollups: HorseRollup[]): HorseKpis {
  let sessionNum = 0;
  let sessionDen = 0;
  let minutesNum = 0;
  let minutesDen = 0;
  let withObjectives = 0;
  for (const r of rollups) {
    const hasAny = r.target_session_count != null || r.target_ride_minutes != null;
    if (hasAny) withObjectives += 1;
    if (r.target_session_count != null && r.target_session_count > 0) {
      sessionNum += Math.min(r.session_count, r.target_session_count);
      sessionDen += r.target_session_count;
    }
    if (r.target_ride_minutes != null && r.target_ride_minutes > 0) {
      minutesNum += Math.min(r.total_ride_minutes, r.target_ride_minutes);
      minutesDen += r.target_ride_minutes;
    }
  }
  return {
    horse_count: rollups.length,
    horses_with_objectives: withObjectives,
    session_progress: sessionDen > 0 ? sessionNum / sessionDen : null,
    minutes_progress: minutesDen > 0 ? minutesNum / minutesDen : null,
  };
}

export function sortHorseRollupsByActivity(rollups: HorseRollup[]): HorseRollup[] {
  // Horses with sessions first (most recent on top); never-ridden sink to
  // the bottom alphabetised so order is stable across reloads.
  return [...rollups].sort((a, b) => {
    if (a.last_session_at && b.last_session_at) {
      return b.last_session_at.localeCompare(a.last_session_at);
    }
    if (a.last_session_at) return -1;
    if (b.last_session_at) return 1;
    return a.name.localeCompare(b.name);
  });
}
