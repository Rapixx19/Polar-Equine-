import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { inferCurrentGait, magnitudeWindow } from "@/lib/session/live-window";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ECG_WINDOW_MS = 4000;
const ACC_WINDOW_MS = 4000;
const ECG_LIMIT = 600;
const ACC_LIMIT = 900;
const HR_LIMIT = 1200;
const RATE_WINDOW_MS = 5000;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("rider_profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.is_admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sessionRes = await supabase
    .from("sessions")
    .select(
      "id, status, start_time, end_time, last_ingest_at, activity_type, horses(name), rider_profiles(display_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!sessionRes.data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const session = sessionRes.data;

  const hrSinceMs = Number(req.nextUrl.searchParams.get("hr_since_ms") ?? 0);

  const latestRes = await supabase
    .from("samples_hr")
    .select("timestamp_ms")
    .eq("session_id", id)
    .order("timestamp_ms", { ascending: false })
    .limit(1)
    .maybeSingle();
  const latestTs = Number(latestRes.data?.timestamp_ms ?? 0);
  const ecgWindowStart = Math.max(0, latestTs - ECG_WINDOW_MS);
  const accWindowStart = Math.max(0, latestTs - ACC_WINDOW_MS);
  const rateWindowStart = Math.max(0, latestTs - RATE_WINDOW_MS);

  const [hrRes, ecgRes, accRes, hrRateRes, ecgRateRes, accRateRes] = await Promise.all([
    supabase
      .from("samples_hr")
      .select("timestamp_ms, hr_bpm, contact")
      .eq("session_id", id)
      .gt("timestamp_ms", hrSinceMs)
      .order("timestamp_ms", { ascending: true })
      .limit(HR_LIMIT),
    supabase
      .from("samples_ecg")
      .select("timestamp_ms, ecg_uv")
      .eq("session_id", id)
      .gte("timestamp_ms", ecgWindowStart)
      .order("timestamp_ms", { ascending: true })
      .limit(ECG_LIMIT),
    supabase
      .from("samples_acc")
      .select("timestamp_ms, ax, ay, az")
      .eq("session_id", id)
      .gte("timestamp_ms", accWindowStart)
      .order("timestamp_ms", { ascending: true })
      .limit(ACC_LIMIT),
    supabase.from("samples_hr").select("*", { count: "exact", head: true })
      .eq("session_id", id).gte("timestamp_ms", rateWindowStart),
    supabase.from("samples_ecg").select("*", { count: "exact", head: true })
      .eq("session_id", id).gte("timestamp_ms", rateWindowStart),
    supabase.from("samples_acc").select("*", { count: "exact", head: true })
      .eq("session_id", id).gte("timestamp_ms", rateWindowStart),
  ]);

  const hrRows = (hrRes.data ?? []).map((r) => ({
    ts_ms: Number(r.timestamp_ms),
    bpm: Number(r.hr_bpm ?? 0),
    contact: r.contact ?? null,
  }));
  const ecgRows = (ecgRes.data ?? []).map((r) => ({
    ts_ms: Number(r.timestamp_ms),
    uv: Number(r.ecg_uv ?? 0),
  }));
  const accRows = (accRes.data ?? []).map((r) => ({
    ts_ms: Number(r.timestamp_ms),
    ax: Number(r.ax ?? 0),
    ay: Number(r.ay ?? 0),
    az: Number(r.az ?? 0),
  }));

  const accMagnitudes = magnitudeWindow(accRows, 50);
  const gait = inferCurrentGait(accRows);
  const nextCursor = hrRows.length > 0 ? hrRows[hrRows.length - 1].ts_ms : hrSinceMs;
  const now = Date.now();
  const lastIngestMs = session.last_ingest_at ? new Date(session.last_ingest_at).getTime() : null;
  const secondsSinceIngest = lastIngestMs ? Math.max(0, (now - lastIngestMs) / 1000) : Infinity;

  return NextResponse.json({
    session: {
      id: session.id,
      status: session.status,
      start_time: session.start_time,
      end_time: session.end_time,
      last_ingest_at: session.last_ingest_at,
      activity_type: session.activity_type,
      rider: (session.rider_profiles as { display_name?: string | null } | null)?.display_name ?? null,
      horse: (session.horses as { name?: string | null } | null)?.name ?? null,
    },
    hr: { samples: hrRows, cursor: nextCursor },
    ecg: { samples: ecgRows, window_ms: ECG_WINDOW_MS },
    acc: { magnitudes: accMagnitudes, window_ms: ACC_WINDOW_MS, gait },
    health: {
      hr_per_sec: ((hrRateRes.count ?? 0) / (RATE_WINDOW_MS / 1000)),
      acc_per_sec: ((accRateRes.count ?? 0) / (RATE_WINDOW_MS / 1000)),
      ecg_per_sec: ((ecgRateRes.count ?? 0) / (RATE_WINDOW_MS / 1000)),
      seconds_since_ingest: Number.isFinite(secondsSinceIngest) ? Math.round(secondsSinceIngest) : null,
      stale: !Number.isFinite(secondsSinceIngest) || secondsSinceIngest > 10,
      latest_ts_ms: latestTs,
    },
    fetched_at: new Date(now).toISOString(),
  });
}
