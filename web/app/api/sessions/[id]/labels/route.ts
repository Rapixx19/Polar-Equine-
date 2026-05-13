import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import {
  approveLabelsBody,
  isEditWindowOpen,
} from "@/lib/api/label-helpers";
import { sessionIdParam } from "@/lib/api/session-helpers";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id: rawId } = await ctx.params;
  const idParse = sessionIdParam.safeParse(rawId);
  if (!idParse.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const id = idParse.data;

  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = approveLabelsBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const body = parsed.data;

  const sessionRow = await supabase
    .from("sessions")
    .select("id, created_at, status, rider_id")
    .eq("id", id)
    .maybeSingle();

  // RLS already filters by rider_id, so a missing row means either the session
  // doesn't exist or the rider doesn't own it. Both surface as 404 so we don't
  // leak which case it is.
  if (!sessionRow.data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (sessionRow.data.status !== "completed") {
    return NextResponse.json({ error: "wrong_status" }, { status: 409 });
  }
  if (!sessionRow.data.created_at || !isEditWindowOpen(sessionRow.data.created_at)) {
    return NextResponse.json({ error: "edit_window_closed" }, { status: 410 });
  }

  // One row per block. correction_kind = 'approved' when the rider accepted the
  // classifier's guess unchanged; 'relabelled' when they overrode it. Note that
  // a jump_count > 0 alone does NOT count as a relabel — jump count is an
  // orthogonal annotation the classifier can't produce yet (no impulse data).
  const rows = body.blocks.map((b) => ({
    session_id: id,
    rider_id: user.id,
    auto_start_ms: b.start_ms,
    auto_end_ms: b.end_ms,
    auto_label_type: b.auto_label,
    auto_jump_count: 0,
    corrected_start_ms: b.start_ms,
    corrected_end_ms: b.end_ms,
    corrected_label_type: b.corrected_label,
    corrected_jump_count: b.jump_count,
    correction_kind: b.auto_label === b.corrected_label ? "approved" : "relabelled",
    algo_version: body.algo_version,
  }));

  const insert = await supabase.from("label_corrections").insert(rows).select("id");
  if (insert.error || !insert.data) {
    if (insert.error?.code === "42501") {
      // RLS denied — most likely status changed between the read above and
      // the write here (rare race). Surface as 409 so the client refreshes.
      return NextResponse.json({ error: "wrong_status" }, { status: 409 });
    }
    console.error("label_insert_failed", {
      code: insert.error?.code,
      message: insert.error?.message,
    });
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  // Optional rider notes. Trim → drop empties so we don't pollute the column
  // with whitespace. Length already capped by Zod (SESSION_NOTES_MAX = 500).
  const trimmedNotes =
    typeof body.notes === "string" ? body.notes.trim().slice(0, 500) : "";
  const notesPatch = trimmedNotes.length > 0 ? { notes: trimmedNotes } : {};

  // Flip status only after rows are in. UPDATE is gated by status='completed'
  // so a retry POST after a successful flip naturally 409s on the wrong_status
  // branch above (rows already inserted, status no longer 'completed').
  const update = await supabase
    .from("sessions")
    .update({
      status: "approved",
      updated_at: new Date().toISOString(),
      ...notesPatch,
    })
    .eq("id", id)
    .eq("status", "completed")
    .select("id");

  if (update.error || !update.data || update.data.length === 0) {
    console.error("session_approve_failed", {
      code: update.error?.code,
      message: update.error?.message,
    });
    return NextResponse.json({ error: "approve_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, inserted: insert.data.length });
}
