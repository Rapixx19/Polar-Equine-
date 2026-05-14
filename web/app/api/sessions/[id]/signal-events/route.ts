import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Capped at 50 events per POST. Real sessions emit a handful; the cap is
// a guard against runaway client loops, not a routine limit.
const Body = z.object({
  events: z
    .array(
      z.object({
        kind: z.enum(["weak", "lost"]),
        t_start_ms: z.number().int().min(0),
        t_end_ms: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(50),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Each event must have t_end >= t_start; the DB CHECK enforces this too,
  // but bouncing it here returns a cleaner 400 than a Postgres error.
  for (const e of body.events) {
    if (e.t_end_ms < e.t_start_ms) {
      return NextResponse.json({ error: "invalid_event_range" }, { status: 400 });
    }
  }

  const rows = body.events.map((e) => ({
    session_id: id,
    kind: e.kind,
    t_start_ms: e.t_start_ms,
    t_end_ms: e.t_end_ms,
  }));

  const { error } = await supabase.from("session_signal_events").insert(rows);
  if (error) {
    if (error.code === "42501") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    console.error("signal_events_insert_failed", {
      code: error.code,
      message: error.message,
      sessionId: id,
      count: rows.length,
    });
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  return NextResponse.json({ inserted: rows.length });
}
