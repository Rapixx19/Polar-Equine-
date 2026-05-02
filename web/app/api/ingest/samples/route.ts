import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { ingestSamplesBody } from "@/lib/api/ingest-validation";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = ingestSamplesBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { session_id, samples } = parsed.data;
  if (samples.hr.length === 0) {
    return NextResponse.json({ received: { hr: 0 } });
  }

  const rows = samples.hr.map((s) => ({
    session_id,
    timestamp_ms: s.t_ms,
    hr_bpm: s.hr_bpm,
    rr_ms: s.rr_ms,
    contact: s.contact,
  }));

  const insert = await supabase.from("samples_hr").insert(rows).select("id");

  if (insert.error) {
    // RLS on samples_hr collapses three failure modes into 42501:
    // (a) rider doesn't own the session, (b) session.status != 'active',
    // (c) session_id doesn't exist. Spec asks for distinct 403/404/409;
    // we return 403 for all three, matching /api/sessions precedent.
    // Slice 8 splits the codes when idempotency forces a session lookup.
    if (insert.error.code === "42501") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    console.error("ingest_failed", { code: insert.error.code, message: insert.error.message });
    return NextResponse.json({ error: "ingest_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: { hr: rows.length } });
}
