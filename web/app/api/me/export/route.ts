import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";

// GDPR self-export. The caller authenticates; every query below runs under the
// rider's own JWT, so RLS filters every table to rows that already belong to
// them. No anonymisation (this is *their* data, including their display name).
// One synchronous bundle is fine for V.0 session volumes; if a rider ends up
// with many months of ACC/ECG data we'll switch to a streamed format.

type ExportBundle = {
  manifest: {
    export_id: string;
    user_id: string;
    exported_at: string;
    schema_version: 1;
  };
  rider_profile: Record<string, unknown> | null;
  horses: Array<Record<string, unknown>>;
  sessions: Array<Record<string, unknown>>;
  samples_hr: Array<Record<string, unknown>>;
  samples_acc: Array<Record<string, unknown>>;
  samples_ecg: Array<Record<string, unknown>>;
  session_metrics: Array<Record<string, unknown>>;
  session_signal_events: Array<Record<string, unknown>>;
  label_corrections: Array<Record<string, unknown>>;
};

export async function GET(_req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [profileRes, sessionsRes, horsesRes] = await Promise.all([
    supabase.from("rider_profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase
      .from("sessions")
      .select("*")
      .eq("rider_id", user.id)
      .order("start_time", { ascending: true }),
    supabase.from("horses").select("*"),
  ]);

  if (profileRes.error || sessionsRes.error || horsesRes.error) {
    console.error(
      "me_export_root_fetch_failed " +
        JSON.stringify({
          profileErr: profileRes.error,
          sessionsErr: sessionsRes.error,
          horsesErr: horsesRes.error,
          user_id: user.id,
        }),
    );
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  const sessions = (sessionsRes.data ?? []) as Array<Record<string, unknown>>;
  const sessionIds = sessions.map((s) => s.id as string);

  const baseBundle: ExportBundle = {
    manifest: {
      export_id: crypto.randomUUID(),
      user_id: user.id,
      exported_at: new Date().toISOString(),
      schema_version: 1,
    },
    rider_profile: profileRes.data ?? null,
    horses: (horsesRes.data ?? []) as Array<Record<string, unknown>>,
    sessions,
    samples_hr: [],
    samples_acc: [],
    samples_ecg: [],
    session_metrics: [],
    session_signal_events: [],
    label_corrections: [],
  };

  if (sessionIds.length === 0) {
    return jsonAttachment(baseBundle);
  }

  const [hrRes, accRes, ecgRes, metricsRes, signalRes, labelsRes] = await Promise.all([
    supabase
      .from("samples_hr")
      .select("session_id, timestamp_ms, hr_bpm, rr_ms, contact")
      .in("session_id", sessionIds)
      .order("timestamp_ms", { ascending: true }),
    supabase
      .from("samples_acc")
      .select("session_id, timestamp_ms, ax, ay, az")
      .in("session_id", sessionIds)
      .order("timestamp_ms", { ascending: true }),
    supabase
      .from("samples_ecg")
      .select("session_id, timestamp_ms, ecg_uv")
      .in("session_id", sessionIds)
      .order("timestamp_ms", { ascending: true }),
    supabase.from("session_metrics").select("*").in("session_id", sessionIds),
    supabase.from("session_signal_events").select("*").in("session_id", sessionIds),
    supabase.from("label_corrections").select("*").in("session_id", sessionIds),
  ]);

  if (
    hrRes.error ||
    accRes.error ||
    ecgRes.error ||
    metricsRes.error ||
    signalRes.error ||
    labelsRes.error
  ) {
    console.error(
      "me_export_related_fetch_failed " +
        JSON.stringify({
          hrErr: hrRes.error,
          accErr: accRes.error,
          ecgErr: ecgRes.error,
          metricsErr: metricsRes.error,
          signalErr: signalRes.error,
          labelsErr: labelsRes.error,
          user_id: user.id,
        }),
    );
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  const bundle: ExportBundle = {
    ...baseBundle,
    samples_hr: (hrRes.data ?? []) as Array<Record<string, unknown>>,
    samples_acc: (accRes.data ?? []) as Array<Record<string, unknown>>,
    samples_ecg: (ecgRes.data ?? []) as Array<Record<string, unknown>>,
    session_metrics: (metricsRes.data ?? []) as Array<Record<string, unknown>>,
    session_signal_events: (signalRes.data ?? []) as Array<Record<string, unknown>>,
    label_corrections: (labelsRes.data ?? []) as Array<Record<string, unknown>>,
  };

  return jsonAttachment(bundle);
}

function jsonAttachment(bundle: ExportBundle): NextResponse {
  const filename = `my-data-${bundle.manifest.exported_at.slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
