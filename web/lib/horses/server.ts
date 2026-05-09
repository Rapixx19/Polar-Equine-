import type { TypedSupabaseClient } from "@/lib/auth/server";
import type { ActivityType, RidingSubtype } from "@/lib/activities";

export type HorseOption = { id: string; name: string };
export type HorseOptionWithPreferred = HorseOption & { isPreferred: boolean };

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

// Returns the rider's last-used horse id (rider_profiles.preferred_horse_id)
// or null if unset / row missing / select fails. The page sorts the picker
// so this horse appears first; an orphan id (rider lost access since last
// use) falls through to alphabetical order via sortHorsesWithPreferred.
export async function getRiderPreferredHorseId(
  supabase: TypedSupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("rider_profiles")
    .select("preferred_horse_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("get_preferred_horse_failed", {
      code: error.code,
      message: error.message,
    });
    return null;
  }
  return data?.preferred_horse_id ?? null;
}

// Pure sort: hoist the rider's preferred horse to the top of the list and
// flag it with `isPreferred: true`. If the preferred id is null or no longer
// in the list (orphaned), the original order is preserved with all flags
// false.
export function sortHorsesWithPreferred(
  horses: HorseOption[],
  preferredId: string | null,
): HorseOptionWithPreferred[] {
  if (!preferredId) {
    return horses.map((h) => ({ ...h, isPreferred: false }));
  }
  const idx = horses.findIndex((h) => h.id === preferredId);
  if (idx === -1) {
    return horses.map((h) => ({ ...h, isPreferred: false }));
  }
  const preferred = { ...horses[idx], isPreferred: true };
  const rest = [...horses.slice(0, idx), ...horses.slice(idx + 1)].map((h) => ({
    ...h,
    isPreferred: false,
  }));
  return [preferred, ...rest];
}
