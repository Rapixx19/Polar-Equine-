import type { SupabaseClient } from "@supabase/supabase-js";

import { LABEL_EDIT_WINDOW_MS } from "@/lib/api/label-helpers";
import type { Database } from "@/lib/supabase/types";

export type NeedsReviewSession = {
  id: string;
  horse: { name: string } | { name: string }[] | null;
};

export async function fetchNeedsReview(
  supabase: SupabaseClient<Database>,
  riderId: string,
  now: Date = new Date(),
): Promise<NeedsReviewSession | null> {
  const cutoff = new Date(now.getTime() - LABEL_EDIT_WINDOW_MS).toISOString();
  const { data } = await supabase
    .from("sessions")
    .select("id, horse:horses(name)")
    .eq("rider_id", riderId)
    .eq("status", "completed")
    .gt("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data ?? null) as NeedsReviewSession | null;
}
