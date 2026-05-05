import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { patchSessionBody, sessionIdParam } from "@/lib/api/session-helpers";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: RouteContext) {
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

  const parsed = patchSessionBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const body = parsed.data;

  if ("action" in body && body.action === "end") {
    // Refuse to re-end an already-completed session. PATCH end is not idempotent
    // the way POST start is — the second call signals a state error, not duplicate intent.
    const current = await supabase
      .from("sessions")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (!current.data) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (current.data.status === "completed") {
      return NextResponse.json({ error: "already_ended" }, { status: 409 });
    }

    const update = await supabase
      .from("sessions")
      .update({
        end_time: new Date().toISOString(),
        status: "completed",
        updated_at: new Date().toISOString(),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      })
      .eq("id", id)
      .select("id");

    if (update.error || !update.data || update.data.length === 0) {
      console.error("session_end_failed", { code: update.error?.code, message: update.error?.message });
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  // notes-only branch
  const update = await supabase
    .from("sessions")
    .update({ notes: body.notes, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");

  if (update.error || !update.data || update.data.length === 0) {
    console.error("session_notes_failed", { code: update.error?.code, message: update.error?.message });
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
