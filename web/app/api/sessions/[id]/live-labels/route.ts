import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { sessionIdParam } from "@/lib/api/session-helpers";
import {
  JUMP_COUNT_MAX,
  JUMP_COUNT_MIN,
  LIVE_LABELS,
} from "@/lib/session/live-labels";

// Live, point-in-time ground-truth labels. Rider taps a gait chip on the
// recording screen the moment the horse picks up that gait; we record an
// exact (session_id, t_ms, label) row. Distinct from `label_corrections`
// which is block-shaped and edited after the ride.

type RouteContext = { params: Promise<{ id: string }> };

const postBody = z
  .object({
    // Offset from sessions.start_time, in milliseconds. Same clock as samples_hr.
    t_ms: z.number().int().nonnegative(),
    label: z.enum(LIVE_LABELS),
    jump_count: z
      .number()
      .int()
      .min(JUMP_COUNT_MIN)
      .max(JUMP_COUNT_MAX)
      .optional(),
  })
  .refine(
    (b) => (b.label === "jump" ? b.jump_count != null : b.jump_count == null),
    { message: "jump_count is required iff label === 'jump'" },
  );

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

  const parsed = postBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { t_ms, label, jump_count } = parsed.data;

  // RLS does the work: rider can only insert when they own the session AND
  // status='active'. We still set rider_id explicitly because the policy's
  // WITH CHECK requires it match auth.uid().
  // Cast: migration 033/034 adds session_live_labels; generated types regenerate post-merge.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insert = (await (supabase.from("session_live_labels" as any) as any)
    .insert({
      session_id: id,
      rider_id: user.id,
      t_ms,
      label,
      jump_count: jump_count ?? null,
    })
    .select("id, t_ms, label, jump_count")
    .single()) as {
      data: { id: string; t_ms: number; label: string; jump_count: number | null } | null;
      error: { code: string; message: string } | null;
    };

  if (insert.error || !insert.data) {
    // RLS denial = session not owned, not active, or session_id doesn't exist.
    if (insert.error?.code === "42501" || insert.error?.code === "23503") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    console.error("live_label_insert_failed " + JSON.stringify({
      code: insert.error?.code,
      message: insert.error?.message,
      session_id: id,
    }));
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...insert.data }, { status: 201 });
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
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

  // Cast: see POST comment above.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = (await (supabase.from("session_live_labels" as any) as any)
    .select("id, t_ms, label, jump_count, created_at")
    .eq("session_id", id)
    .order("t_ms", { ascending: true })) as {
      data: Array<{
        id: string;
        t_ms: number;
        label: string;
        jump_count: number | null;
        created_at: string;
      }> | null;
      error: { code: string; message: string } | null;
    };

  if (res.error) {
    console.error("live_label_fetch_failed " + JSON.stringify({
      code: res.error.code,
      message: res.error.message,
      session_id: id,
    }));
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  return NextResponse.json({ labels: res.data ?? [] }, {
    headers: { "cache-control": "no-store" },
  });
}
