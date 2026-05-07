import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient, getUser, type TypedSupabaseClient } from "@/lib/auth/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 1000;

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

  const lines: string[] = ["timestamp_ms,hr_bpm,rr_ms,contact"];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("samples_hr")
      .select("timestamp_ms, hr_bpm, rr_ms, contact")
      .eq("session_id", id)
      .order("timestamp_ms", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json({ error: "query_failed", detail: error.message }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    for (const r of data) {
      lines.push(
        `${r.timestamp_ms},${r.hr_bpm ?? ""},${r.rr_ms ?? ""},${r.contact === null ? "" : r.contact ? "true" : "false"}`,
      );
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const body = lines.join("\n") + "\n";
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="session-${id.slice(0, 8)}-samples.csv"`,
      "cache-control": "no-store",
    },
  });
}
