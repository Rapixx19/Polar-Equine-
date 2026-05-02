import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/auth/server";

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("logout_failed", { code: error.code, status: error.status });
    return NextResponse.json({ error: "logout_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
