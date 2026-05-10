import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { createHorseBody } from "@/lib/api/horse-helpers";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = createHorseBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Migration 021: SECURITY DEFINER RPC creates horses + horse_riders rows
  // atomically. The function validates the name server-side too — keep this
  // route's Zod check in sync with the RPC's CHECK (length 1..80).
  const { data, error } = await supabase.rpc("create_horse_for_self", {
    p_name: parsed.data.name,
  });

  if (error) {
    // Map the named pg exceptions raised by the RPC.
    if (error.code === "42501") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (error.code === "22023") {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    if (error.code === "23503") {
      // rider_profiles row missing → first-login provisioner hasn't run yet.
      return NextResponse.json({ error: "no_rider_profile" }, { status: 409 });
    }
    console.error("create_horse_failed", { code: error.code, message: error.message });
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  // RETURNS TABLE → array; we expect exactly one row.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    console.error("create_horse_no_row");
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }
  return NextResponse.json({ id: row.id, name: row.name });
}
