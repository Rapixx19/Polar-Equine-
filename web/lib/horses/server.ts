import type { TypedSupabaseClient } from "@/lib/auth/server";

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
