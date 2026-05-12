import { NextResponse, type NextRequest } from "next/server";

import {
  byteCountWithinTolerance,
  chunkCommitBody,
  chunkStoragePath,
  expectedChunkBytes,
} from "@/lib/api/chunk-helpers";
import { createServerSupabaseClient, getUser } from "@/lib/auth/server";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = chunkCommitBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const body = parsed.data;
  if (body.end_t_ms < body.start_t_ms) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const sessionRow = await supabase
    .from("sessions")
    .select("id, status, rider_id")
    .eq("id", body.session_id)
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

  // Byte-count sanity check absorbs realistic BLE jitter (±20%). Catches "wrong
  // sample rate reported" or "blob got truncated mid-upload" early.
  const expected = expectedChunkBytes(
    body.stream,
    body.end_t_ms - body.start_t_ms,
    body.sample_rate_hz,
  );
  if (!byteCountWithinTolerance(body.byte_count, expected)) {
    return NextResponse.json(
      { error: "byte_count_out_of_tolerance", expected, observed: body.byte_count },
      { status: 400 },
    );
  }

  const storage_path = chunkStoragePath(body.session_id, body.stream, body.chunk_index);

  // signal_chunks RLS policy mirrors samples_hr: insert requires an active
  // session owned by the calling user, so RLS will surface 42501 if the auth
  // context doesn't match.
  const insert = await supabase
    .from("signal_chunks")
    .insert({
      session_id: body.session_id,
      stream: body.stream,
      chunk_index: body.chunk_index,
      start_t_ms: body.start_t_ms,
      end_t_ms: body.end_t_ms,
      sample_rate_hz: body.sample_rate_hz,
      resolution_bits: body.resolution_bits,
      range_g: body.range_g ?? null,
      channels: body.channels,
      storage_path,
      byte_count: body.byte_count,
    })
    .select("id");

  if (insert.error) {
    if (insert.error.code === "42501") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (insert.error.code === "23505") {
      // Unique violation on (session_id, stream, chunk_index) — client retry that
      // succeeded server-side already. Idempotent success.
      return NextResponse.json({ ok: true, idempotent: true });
    }
    console.error("chunk_commit_failed", { code: insert.error.code, message: insert.error.message });
    return NextResponse.json({ error: "chunk_commit_failed" }, { status: 500 });
  }

  // Best-effort heartbeat to match the HR ingest path.
  const touch = await supabase
    .from("sessions")
    .update({ last_ingest_at: new Date().toISOString() })
    .eq("id", body.session_id);
  if (touch.error) {
    console.error("last_ingest_at_update_failed", { code: touch.error.code, message: touch.error.message });
  }

  return NextResponse.json({ ok: true });
}
