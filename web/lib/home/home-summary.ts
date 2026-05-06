import type { SupabaseClient } from "@supabase/supabase-js";

import { activityLabel } from "@/components/session/ActivityTile";
import { RIDING_SUBTYPE_UI, type ActivityType, type RidingSubtype } from "@/lib/activities";
import type { Database } from "@/lib/supabase/types";

export type HomeSummary =
  | { state: "empty" }
  | {
      state: "live";
      session: {
        id: string;
        horseName: string;
        activityLabel: string;
        startedAtRelative: string;
      };
    }
  | {
      state: "recap";
      session: {
        id: string;
        horseName: string;
        activityLabel: string;
        endedAtRelative: string;
        durationMin: number | null;
        hrAvg: number | null;
        hrPeak: number | null;
      };
    };

type SessionRow = {
  id: string;
  start_time: string;
  end_time: string | null;
  status: string | null;
  activity_type: string;
  riding_subtype: string | null;
  activity_note: string | null;
  horses: { name: string } | null;
  session_metrics: { hr_avg: number | null; hr_peak: number | null; duration_s: number | null } | null;
};

export async function fetchHomeSummary(
  supabase: SupabaseClient<Database>,
  riderId: string,
  now: Date = new Date(),
): Promise<HomeSummary> {
  const { data } = await supabase
    .from("sessions")
    .select(
      "id, start_time, end_time, status, activity_type, riding_subtype, activity_note, horses(name), session_metrics(hr_avg, hr_peak, duration_s)",
    )
    .eq("rider_id", riderId)
    .order("start_time", { ascending: false })
    .limit(1)
    .maybeSingle<SessionRow>();

  if (!data) return { state: "empty" };

  const horseName = data.horses?.name ?? "Horse";
  const label = formatActivityLabel(data.activity_type, data.riding_subtype, data.activity_note);

  if (data.status === "active") {
    return {
      state: "live",
      session: {
        id: data.id,
        horseName,
        activityLabel: label,
        startedAtRelative: relativeFromIso(data.start_time, now),
      },
    };
  }

  const metrics = data.session_metrics;
  return {
    state: "recap",
    session: {
      id: data.id,
      horseName,
      activityLabel: label,
      endedAtRelative: relativeFromIso(data.end_time ?? data.start_time, now),
      durationMin: metrics?.duration_s ? Math.round(metrics.duration_s / 60) : null,
      hrAvg: metrics?.hr_avg ?? null,
      hrPeak: metrics?.hr_peak ?? null,
    },
  };
}

function formatActivityLabel(
  activityType: string,
  ridingSubtype: string | null,
  activityNote: string | null,
): string {
  if (activityType === "other" && activityNote) return activityNote;
  const base = activityLabel(activityType as ActivityType);
  if ((activityType === "riding" || activityType === "lunging") && ridingSubtype) {
    const sub = RIDING_SUBTYPE_UI[ridingSubtype as RidingSubtype]?.label;
    if (sub) return `${base} · ${sub}`;
  }
  return base;
}

export function relativeFromIso(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diffMs = now.getTime() - then;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  return `${weeks}w ago`;
}
