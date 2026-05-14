import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { anonymiseRawBundle, type RawSession } from "@/lib/admin/anonymise-raw";
import { anonymiseRawStream, isRawStream } from "@/lib/admin/anonymise-raw-stream";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  // ?include=acc,ecg gates PMD payload arrays. Default omits both — manifest
  // row counts are still honest. Unknown tokens are ignored.
  const includeTokens = new Set(
    (req.nextUrl.searchParams.get("include") ?? "")
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  );
  const include = { acc: includeTokens.has("acc"), ecg: includeTokens.has("ecg") };

  // ?stream=hr|acc|ecg|labels|label_corrections|metrics returns a single-stream
  // bundle instead of the full verbatim dump. Pseudonyms still in the manifest.
  const streamParam = req.nextUrl.searchParams.get("stream")?.trim().toLowerCase();
  if (streamParam && !isRawStream(streamParam)) {
    return NextResponse.json({ error: "invalid_stream" }, { status: 400 });
  }
  const stream = streamParam && isRawStream(streamParam) ? streamParam : null;

  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("rider_profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.is_admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .select(
      "id, rider_id, horse_id, band_id, activity_type, start_time, end_time, status, metrics_status, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (sessionErr) {
    console.error("admin_export_raw_session_fetch_failed " + JSON.stringify({ err: sessionErr, id }));
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [hrRes, accRes, ecgRes, labelsRes, correctionsRes, metricsRes] = await Promise.all([
    supabase.from("samples_hr").select("*").eq("session_id", id).order("timestamp_ms", { ascending: true }),
    supabase.from("samples_acc").select("*").eq("session_id", id).order("timestamp_ms", { ascending: true }),
    supabase.from("samples_ecg").select("*").eq("session_id", id).order("timestamp_ms", { ascending: true }),
    supabase.from("labels").select("*").eq("session_id", id).order("start_ms", { ascending: true }),
    supabase
      .from("label_corrections")
      .select("*")
      .eq("session_id", id)
      .order("auto_start_ms", { ascending: true }),
    supabase.from("session_metrics").select("*").eq("session_id", id).maybeSingle(),
  ]);

  const errs = [hrRes.error, accRes.error, ecgRes.error, labelsRes.error, correctionsRes.error, metricsRes.error]
    .filter(Boolean);
  if (errs.length > 0) {
    console.error("admin_export_raw_related_fetch_failed " + JSON.stringify({ id, errs }));
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  const bundleInput = {
    session: session as RawSession,
    samples_hr: (hrRes.data ?? []) as Array<Record<string, unknown>>,
    samples_acc: (accRes.data ?? []) as Array<Record<string, unknown>>,
    samples_ecg: (ecgRes.data ?? []) as Array<Record<string, unknown>>,
    labels: (labelsRes.data ?? []) as Array<Record<string, unknown>>,
    label_corrections: (correctionsRes.data ?? []) as Array<Record<string, unknown>>,
    session_metrics: (metricsRes.data ?? null) as Record<string, unknown> | null,
    export_id: crypto.randomUUID(),
    exported_at: new Date().toISOString(),
    include,
  };

  if (stream) {
    const bundle = anonymiseRawStream(bundleInput, stream);
    return new NextResponse(JSON.stringify(bundle, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="session-${id}-${stream}.json"`,
        "cache-control": "no-store",
      },
    });
  }

  const bundle = anonymiseRawBundle(bundleInput);
  return new NextResponse(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="session-${id}-raw.json"`,
      "cache-control": "no-store",
    },
  });
}
