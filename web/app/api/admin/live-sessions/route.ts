import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";

type ActiveSessionRow = {
  id: string;
  activity_type: string;
  start_time: string;
  last_ingest_at: string | null;
  has_prototype_mount: boolean;
  horses: { name: string | null } | null;
  rider_profiles: { display_name: string | null } | null;
};

export async function GET(_req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: me } = await supabase
    .from("rider_profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.is_admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("sessions")
    .select(
      "id, activity_type, start_time, last_ingest_at, has_prototype_mount, horses(name), rider_profiles(display_name)",
    )
    .eq("status", "active")
    .order("start_time", { ascending: false })
    .limit(20);

  if (error) {
    console.error("admin_live_sessions_fetch_failed " + JSON.stringify({ err: error }));
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as ActiveSessionRow[];
  const active = rows.map((r) => ({
    id: r.id,
    activity_type: r.activity_type,
    start_time: r.start_time,
    last_ingest_at: r.last_ingest_at,
    has_prototype_mount: r.has_prototype_mount,
    rider_name: r.rider_profiles?.display_name ?? null,
    horse_name: r.horses?.name ?? null,
  }));

  return NextResponse.json(
    { active, server_now: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } },
  );
}
