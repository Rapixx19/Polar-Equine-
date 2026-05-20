import { after, NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { createServiceRoleClient } from "@/lib/auth/service-role";
import { patchSessionBody, sessionIdParam } from "@/lib/api/session-helpers";
import { claimAndDispatch } from "@/lib/cron/compute-runner";

type RouteContext = { params: Promise<{ id: string }> };

// The finalize action triggers a /compute dispatch via `after()`. The algo's
// own DISPATCH_TIMEOUT_MS is 30s; allow headroom so the function survives
// long enough for the dispatch to finish even if the response was sent
// immediately. Vercel Pro default would clamp this at 60s.
export const maxDuration = 60;

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
    // Compute is intentionally NOT enqueued here. The rider lands on the
    // /saved page, picks the session kind, and the finalize action below
    // enqueues + dispatches immediately. This keeps the algo run gated on
    // a confirmed kind.
    return NextResponse.json({ ok: true });
  }

  if ("action" in body && body.action === "finalize") {
    const current = await supabase
      .from("sessions")
      .select("status, activity_type, riding_subtype, kind_id")
      .eq("id", id)
      .maybeSingle();
    if (!current.data) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (current.data.status !== "completed") {
      return NextResponse.json({ error: "not_completed" }, { status: 409 });
    }

    const update = await supabase
      .from("sessions")
      .update({
        activity_type: body.activity_type,
        riding_subtype: body.riding_subtype ?? null,
        kind_id: body.kind_id,
        updated_at: new Date().toISOString(),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      })
      .eq("id", id)
      .select("id");

    if (update.error || !update.data || update.data.length === 0) {
      console.error("session_finalize_failed", {
        code: update.error?.code,
        message: update.error?.message,
      });
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }

    const admin = createServiceRoleClient();
    // If a compute_jobs row already exists for this session (re-finalize
    // path), enqueue is a no-op via the unique partial index from migration
    // 011 — we just trigger a fresh dispatch. Otherwise insert.
    const existing = await admin
      .from("compute_jobs")
      .select("id")
      .eq("session_id", id)
      .in("status", ["queued", "running", "succeeded"])
      .limit(1)
      .maybeSingle();
    if (!existing.data) {
      const enqueue = await admin
        .from("compute_jobs")
        .insert({ session_id: id, job_type: "compute", status: "queued" });
      if (enqueue.error) {
        console.error("compute_job_enqueue_failed", {
          code: enqueue.error.code,
          message: enqueue.error.message,
        });
        return NextResponse.json({ ok: true, enqueued: false }, { status: 200 });
      }
    } else {
      // Re-finalize after kind change: re-queue the existing row so the
      // runner picks it up and dispatches /compute again.
      await admin
        .from("compute_jobs")
        .update({
          status: "queued",
          attempts: 0,
          next_run_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.data.id);
    }

    // Fire the dispatch right away (after the response is sent). Cron stays
    // as the safety-net retry; this brings the typical wait from ~90s
    // (cron-interval + algo) down to ~30s (algo only).
    after(async () => {
      try {
        await claimAndDispatch(admin);
      } catch (err) {
        console.error("immediate_dispatch_failed", { error: String(err) });
      }
    });

    return NextResponse.json({ ok: true, enqueued: true });
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
