import { NextResponse } from "next/server";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("rider_profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.is_admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data, error } = await supabase
    .from("sessions")
    .select(
      "id, rider_id, horse_id, activity_type, start_time, last_ingest_at, status, horses(name), rider_profiles(display_name)",
    )
    .eq("status", "active")
    .order("last_ingest_at", { ascending: false, nullsFirst: false })
    .limit(50);

  if (error) {
    console.error("admin_active_sessions_failed", { code: error.code, message: error.message });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  const now = Date.now();
  const sessions = (data ?? []).map((s) => {
    const last = s.last_ingest_at ? new Date(s.last_ingest_at).getTime() : null;
    return {
      id: s.id,
      rider: (s.rider_profiles as { display_name?: string | null } | null)?.display_name ?? null,
      horse: (s.horses as { name?: string | null } | null)?.name ?? null,
      activity_type: s.activity_type,
      start_time: s.start_time,
      last_ingest_at: s.last_ingest_at,
      seconds_since_ingest: last ? Math.max(0, Math.round((now - last) / 1000)) : null,
      stale: last ? now - last > 10_000 : true,
    };
  });

  return NextResponse.json({ sessions, fetched_at: new Date(now).toISOString() });
}
