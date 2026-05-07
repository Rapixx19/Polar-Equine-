import { NextResponse, type NextRequest } from "next/server";

import { getSessionDetail } from "@/lib/admin/queries";
import { createServerSupabaseClient, getUser, type TypedSupabaseClient } from "@/lib/auth/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

async function isAdmin(supabase: TypedSupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("rider_profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle<{ is_admin: boolean }>();
  return data?.is_admin === true;
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const detail = await getSessionDetail(supabase, id);
  if (!detail) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      session: detail.session,
      metrics: detail.metrics,
      compute_jobs: detail.jobs,
      sample_count: detail.sampleCount,
    },
    null,
    2,
  );
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="session-${id.slice(0, 8)}-metadata.json"`,
      "cache-control": "no-store",
    },
  });
}
