import { NextResponse, type NextRequest } from "next/server";

import { createServiceRoleClient } from "@/lib/auth/service-role";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

// Cron-driven cleanup: any 'active' session whose last_ingest_at is older than
// 12h is marked 'abandoned' so the per-horse partial-unique index releases the
// horse for the next rider. See docs/shared/09-v0-1-hardening.md Fix 5.
const STALE_INTERVAL_MS = 12 * 60 * 60 * 1000;
// compute_jobs claim incremented attempts when the row went 'running'. The
// reset back to 'queued' does NOT re-increment, so the original retry budget
// still applies — a job stuck twice naturally lands at attempts=2 → 'failed'.
const STUCK_RUNNING_MS = 5 * 60 * 1000;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const cutoff = new Date(Date.now() - STALE_INTERVAL_MS).toISOString();
  const now = new Date().toISOString();

  const update = await supabase
    .from("sessions")
    .update({ status: "abandoned", end_time: now })
    .eq("status", "active")
    .lt("last_ingest_at", cutoff)
    .select("id");

  if (update.error) {
    console.error("abandon_stale_failed", { code: update.error.code, message: update.error.message });
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  const stuckCutoff = new Date(Date.now() - STUCK_RUNNING_MS).toISOString();
  const reset = await supabase
    .from("compute_jobs")
    .update({ status: "queued", last_error: "stuck_running_reset", updated_at: now })
    .eq("status", "running")
    .lt("updated_at", stuckCutoff)
    .select("id");

  if (reset.error) {
    console.error("compute_jobs_reset_failed", { code: reset.error.code, message: reset.error.message });
    return NextResponse.json({ error: "reset_failed" }, { status: 500 });
  }

  return NextResponse.json({
    abandoned: update.data?.length ?? 0,
    jobs_reset: reset.data?.length ?? 0,
  });
}
