import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import {
  anonymiseBundle,
  type RawLabelCorrection,
  type RawSampleHr,
  type RawSession,
} from "@/lib/admin/anonymise";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    .select("id, rider_id, horse_id, activity_type, start_time, end_time, status")
    .eq("id", id)
    .maybeSingle();
  if (sessionErr) {
    console.error("admin_export_session_fetch_failed " + JSON.stringify({ err: sessionErr, id }));
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
  if (!session) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const [samplesRes, metricsRes, labelsRes] = await Promise.all([
    supabase
      .from("samples_hr")
      .select("timestamp_ms, hr_bpm, rr_ms, contact")
      .eq("session_id", id)
      .order("timestamp_ms", { ascending: true }),
    supabase.from("session_metrics").select("*").eq("session_id", id).maybeSingle(),
    supabase
      .from("label_corrections")
      .select(
        "auto_start_ms, auto_end_ms, auto_label_type, auto_jump_count, corrected_start_ms, corrected_end_ms, corrected_label_type, corrected_jump_count, correction_kind, algo_version",
      )
      .eq("session_id", id)
      .order("auto_start_ms", { ascending: true }),
  ]);

  if (samplesRes.error || metricsRes.error || labelsRes.error) {
    console.error(
      "admin_export_related_fetch_failed " +
        JSON.stringify({
          samplesErr: samplesRes.error,
          metricsErr: metricsRes.error,
          labelsErr: labelsRes.error,
          id,
        }),
    );
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  const bundle = anonymiseBundle({
    session: session as RawSession,
    session_metrics: (metricsRes.data ?? null) as Record<string, unknown> | null,
    samples_hr: (samplesRes.data ?? []) as RawSampleHr[],
    label_corrections: (labelsRes.data ?? []) as RawLabelCorrection[],
    export_id: crypto.randomUUID(),
    exported_at: new Date().toISOString(),
  });

  return new NextResponse(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="session-${id}-anonymised.json"`,
      "cache-control": "no-store",
    },
  });
}
