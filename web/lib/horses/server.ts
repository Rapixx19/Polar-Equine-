import type { TypedSupabaseClient } from "@/lib/auth/server";
import type { ActivityType, RidingSubtype } from "@/lib/activities";

export type HorseOption = { id: string; name: string };

export async function getHorsesForRider(
  supabase: TypedSupabaseClient,
): Promise<HorseOption[]> {
  // RLS auto-filters to horses the rider has been granted via horse_riders.
  const { data, error } = await supabase
    .from("horses")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) {
    console.error("get_horses_failed", { code: error.code, message: error.message });
    return [];
  }
  return data ?? [];
}

// Pure URL builder shared by HorseTile and the single-horse auto-route on
// /start/horse. Keeping it here avoids the two paths drifting (e.g. one
// dropping `note` while the other keeps it).
export function buildSessionStartUrl({
  activity,
  horseId,
  subtype,
  note,
}: {
  activity: ActivityType | string;
  horseId: string;
  subtype?: RidingSubtype | null;
  note?: string | null;
}): string {
  const params = new URLSearchParams({ activity, horse_id: horseId });
  if (subtype) params.set("subtype", subtype);
  if (note) params.set("note", note);
  return `/session/new?${params.toString()}`;
}

// Returns the auto-route URL when the rider has exactly one horse, otherwise
// null. The page falls through to the empty state (0 horses) or the picker
// (2+ horses) when this returns null.
export function autoRouteUrl(
  horses: HorseOption[],
  opts: { activity: ActivityType; subtype?: RidingSubtype | null; note?: string | null },
): string | null {
  if (horses.length !== 1) return null;
  return buildSessionStartUrl({
    activity: opts.activity,
    horseId: horses[0].id,
    subtype: opts.subtype,
    note: opts.note,
  });
}
