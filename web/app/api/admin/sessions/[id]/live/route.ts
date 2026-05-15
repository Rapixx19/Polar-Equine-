import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECENT_HR_SAMPLES = 60;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

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

  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .select("id, status, start_time, end_time, last_ingest_at")
    .eq("id", id)
    .maybeSingle();
  if (sessionErr) {
    console.error("admin_live_session_fetch_failed " + JSON.stringify({ err: sessionErr, id }));
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
  if (!session) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const [hrCountRes, accCountRes, ecgCountRes, recentHrRes] = await Promise.all([
    supabase.from("samples_hr").select("*", { count: "exact", head: true }).eq("session_id", id),
    supabase.from("samples_acc").select("*", { count: "exact", head: true }).eq("session_id", id),
    supabase.from("samples_ecg").select("*", { count: "exact", head: true }).eq("session_id", id),
    supabase
      .from("samples_hr")
      .select("timestamp_ms, hr_bpm")
      .eq("session_id", id)
      .order("timestamp_ms", { ascending: false })
      .limit(RECENT_HR_SAMPLES),
  ]);

  const recentHr = (recentHrRes.data ?? [])
    .map((s) => ({ ts_ms: Number(s.timestamp_ms), bpm: Number(s.hr_bpm ?? 0) }))
    .reverse();
  const latest = recentHr.length > 0 ? recentHr[recentHr.length - 1] : null;

  return NextResponse.json(
    {
      status: session.status,
      start_time: session.start_time,
      end_time: session.end_time,
      last_ingest_at: session.last_ingest_at,
      sample_counts: {
        hr: hrCountRes.count ?? 0,
        acc: accCountRes.count ?? 0,
        ecg: ecgCountRes.count ?? 0,
      },
      latest_hr: latest,
      recent_hr: recentHr,
      server_now: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
