import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import {
  ingestSamplesBody,
  type AccSampleWire,
  type EcgSampleWire,
  type HRSampleWire,
} from "@/lib/api/ingest-validation";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rawBody = await req.json().catch(() => null);
  const parsed = ingestSamplesBody.safeParse(rawBody);
  if (!parsed.success) {
    // First failing issue is enough to diagnose; full list would flood the log
    // on a long batch where every row fails the same cap.
    const first = parsed.error.issues[0];
    const sampleShape = sampleCountsOf(rawBody);
    console.error("ingest_invalid_request", {
      path: first?.path,
      code: first?.code,
      message: first?.message,
      counts: sampleShape,
    });
    return NextResponse.json(
      { error: "invalid_request", detail: first?.message ?? null, path: first?.path ?? null },
      { status: 400 },
    );
  }

  const { session_id, samples } = parsed.data;

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

  // Per Rule 9: any single stream's insert error is surfaced. We do NOT
  // continue silently after a 42501 or 5xx — that would lose the rest of the
  // batch and give the client a false success.
  const hrErr = await insertHr(supabase, session_id, samples.hr);
  if (hrErr) return hrErr;
  const accErr = await insertAcc(supabase, session_id, samples.acc);
  if (accErr) return accErr;
  const ecgErr = await insertEcg(supabase, session_id, samples.ecg);
  if (ecgErr) return ecgErr;

  // Heartbeat for /api/cron/abandon-stale.
  const touch = await supabase
    .from("sessions")
    .update({ last_ingest_at: new Date().toISOString() })
    .eq("id", session_id);
  if (touch.error) {
    console.error("last_ingest_at_update_failed", { code: touch.error.code, message: touch.error.message });
  }

  return NextResponse.json({
    received: { hr: samples.hr.length, acc: samples.acc.length, ecg: samples.ecg.length },
  });
}

type Sb = Awaited<ReturnType<typeof createServerSupabaseClient>>;

async function insertHr(supabase: Sb, session_id: string, rows: HRSampleWire[]) {
  if (rows.length === 0) return null;
  const r = await supabase
    .from("samples_hr")
    .insert(rows.map((s) => ({ session_id, timestamp_ms: s.t_ms, hr_bpm: s.hr_bpm, rr_ms: s.rr_ms, contact: s.contact })))
    .select("id");
  return classifyInsertError("hr", r.error);
}

async function insertAcc(supabase: Sb, session_id: string, rows: AccSampleWire[]) {
  if (rows.length === 0) return null;
  const r = await supabase
    .from("samples_acc")
    .insert(rows.map((s) => ({ session_id, timestamp_ms: s.t_ms, ax: s.ax_mg / 1000, ay: s.ay_mg / 1000, az: s.az_mg / 1000 })))
    .select("id");
  return classifyInsertError("acc", r.error);
}

async function insertEcg(supabase: Sb, session_id: string, rows: EcgSampleWire[]) {
  if (rows.length === 0) return null;
  const r = await supabase
    .from("samples_ecg")
    .insert(rows.map((s) => ({ session_id, timestamp_ms: s.t_ms, ecg_uv: s.uv })))
    .select("id");
  return classifyInsertError("ecg", r.error);
}

function classifyInsertError(
  stream: "hr" | "acc" | "ecg",
  err: { code?: string; message?: string } | null,
): NextResponse | null {
  if (!err) return null;
  if (err.code === "42501") {
    return NextResponse.json({ error: "forbidden", stream }, { status: 403 });
  }
  console.error("ingest_failed", { stream, code: err.code, message: err.message });
  return NextResponse.json({ error: "ingest_failed", stream, detail: err.message ?? null }, { status: 500 });
}

function sampleCountsOf(body: unknown): { hr: number; acc: number; ecg: number } | null {
  if (!body || typeof body !== "object") return null;
  const samples = (body as { samples?: unknown }).samples;
  if (!samples || typeof samples !== "object") return null;
  const s = samples as { hr?: unknown[]; acc?: unknown[]; ecg?: unknown[] };
  return {
    hr: Array.isArray(s.hr) ? s.hr.length : 0,
    acc: Array.isArray(s.acc) ? s.acc.length : 0,
    ecg: Array.isArray(s.ecg) ? s.ecg.length : 0,
  };
}
