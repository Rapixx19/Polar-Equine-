import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { createSessionBody } from "@/lib/api/session-helpers";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = createSessionBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const body = parsed.data;

  // Rule 12 idempotency: if this rider already has a session for this client_session_id,
  // return that row unchanged. Same intent → same result, no duplicate.
  const existing = await supabase
    .from("sessions")
    .select("id, start_time")
    .eq("client_session_id", body.client_session_id)
    .eq("rider_id", user.id)
    .maybeSingle();

  if (existing.data) {
    return NextResponse.json({ id: existing.data.id, start_time: existing.data.start_time });
  }

  const start_time = new Date().toISOString();
  const insert = await supabase
    .from("sessions")
    .insert({
      rider_id: user.id,
      horse_id: body.horse_id,
      band_id: body.band_id ?? null,
      activity_type: body.activity_type,
      riding_subtype: body.riding_subtype ?? null,
      activity_note: body.activity_note ?? null,
      client_session_id: body.client_session_id,
      start_time,
      status: "active",
    })
    .select("id, start_time")
    .single();

  // 23505 has two flavours here:
  //   sessions_client_id_idx           → same rider re-tap; return existing row (Rule 12 idempotency).
  //   sessions_one_active_per_horse_idx → different rider, horse already active; surface 409.
  if (insert.error?.code === "23505") {
    const errMsg = `${insert.error.message ?? ""} ${insert.error.details ?? ""}`;
    if (errMsg.includes("sessions_one_active_per_horse_idx")) {
      return NextResponse.json({ error: "horse_already_active" }, { status: 409 });
    }
    const retry = await supabase
      .from("sessions")
      .select("id, start_time")
      .eq("client_session_id", body.client_session_id)
      .eq("rider_id", user.id)
      .maybeSingle();
    if (retry.data) {
      return NextResponse.json({ id: retry.data.id, start_time: retry.data.start_time });
    }
  }

  if (insert.error || !insert.data) {
    // RLS denial (rider not in horse_riders for this horse) surfaces as PostgREST 42501 / 403.
    if (insert.error?.code === "42501") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    console.error("session_create_failed", { code: insert.error?.code, message: insert.error?.message });
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  // Slice 12.B: remember this horse as the rider's last-used horse so the
  // /start/horse picker hoists it on next visit. Fire-and-forget: a failure
  // here (RLS, transient DB) MUST NOT block the session response — UX > a
  // perfectly-fresh preferred-horse field. The next successful session will
  // simply retry the update.
  try {
    const { error: prefError } = await supabase
      .from("rider_profiles")
      .update({ preferred_horse_id: body.horse_id })
      .eq("id", user.id);
    if (prefError) {
      console.error("update_preferred_horse_failed", {
        code: prefError.code,
        message: prefError.message,
      });
    }
  } catch (err) {
    console.error("update_preferred_horse_threw", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ id: insert.data.id, start_time: insert.data.start_time });
}
