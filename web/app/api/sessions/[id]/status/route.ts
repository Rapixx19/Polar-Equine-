import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { sessionIdParam } from "@/lib/api/session-helpers";

// Tiny GET that the post-session "analyzing" client polls every 2s while the
// algo computes session_metrics. RLS already restricts rows to the rider, so
// a missing row surfaces as 404 (same opacity as the labels POST).
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id: rawId } = await ctx.params;
  const idParse = sessionIdParam.safeParse(rawId);
  if (!idParse.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const row = await supabase
    .from("sessions")
    .select("status, metrics_status, activity_type")
    .eq("id", idParse.data)
    .maybeSingle();

  if (!row.data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    status: row.data.status,
    metrics_status: row.data.metrics_status,
    activity_type: row.data.activity_type,
  });
}
