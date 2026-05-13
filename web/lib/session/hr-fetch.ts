import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import type { HRSample } from "@/lib/session/gait-classifier";

// Pull the HR samples for a session, return them in session-relative ms so the
// classifier and chart components don't need to know about wall-clock time.
// samples_hr.timestamp_ms is absolute (epoch ms, from BLE batcher.ts).
//
// We cap at 5000 rows (~80 min at 1 Hz). Longer rides get sub-sampled by the
// stride — good enough for the chart's visual fidelity and for the threshold
// classifier; HRV needs unsampled data but that's a different feature.
export async function fetchSessionHRSamples(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  startTimeIso: string,
): Promise<HRSample[]> {
  const start = new Date(startTimeIso).getTime();
  const { data, error } = await supabase
    .from("samples_hr")
    .select("timestamp_ms, hr_bpm")
    .eq("session_id", sessionId)
    .not("hr_bpm", "is", null)
    .order("timestamp_ms", { ascending: true })
    .limit(5000);
  if (error || !data) return [];

  const out: HRSample[] = [];
  for (const row of data) {
    if (row.hr_bpm == null) continue;
    out.push({ ts_ms: Math.max(0, row.timestamp_ms - start), bpm: row.hr_bpm });
  }
  return out;
}
