import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { ingestSamplesBody } from "@/lib/api/ingest-validation";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = ingestSamplesBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { session_id, samples } = parsed.data;

  // Pre-flight session check splits the three failure modes RLS would otherwise
  // collapse into 42501: 404 missing, 403 wrong rider, 409 not active.
  const sessionRow = await supabase
    .from("sessions")
    .select("id, status, rider_id")
    .eq("id", session_id)
    .maybeSingle();
  if (!sessionRow.data) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }
  if (sessionRow.data.rider_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (sessionRow.data.status !== "active") {
    return NextResponse.json({ error: "session_not_active" }, { status: 409 });
  }

  if (samples.hr.length === 0) {
    return NextResponse.json({ received: { hr: 0 } });
  }

  const rows = samples.hr.map((s) => ({
    session_id,
    timestamp_ms: s.t_ms,
    hr_bpm: s.hr_bpm,
    rr_ms: s.rr_ms,
    contact: s.contact,
  }));

  const insert = await supabase.from("samples_hr").insert(rows).select("id");

  if (insert.error) {
    if (insert.error.code === "42501") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    console.error("ingest_failed", { code: insert.error.code, message: insert.error.message });
    return NextResponse.json({ error: "ingest_failed" }, { status: 500 });
  }

  // Best-effort heartbeat for /api/cron/abandon-stale; logged but not fatal.
  const touch = await supabase
    .from("sessions")
    .update({ last_ingest_at: new Date().toISOString() })
    .eq("id", session_id);
  if (touch.error) {
    console.error("last_ingest_at_update_failed", { code: touch.error.code, message: touch.error.message });
  }

  return NextResponse.json({ received: { hr: rows.length } });
}
