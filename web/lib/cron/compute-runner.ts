// Compute job runner: claim one queued compute_jobs row, dispatch to algo,
// reconcile the outcome. 409 from algo is terminal-success (lost-response
// reconcile path; do NOT touch sessions.metrics_status).

import type { SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

type Supa = SupabaseClient<Database>;
type JobRow = Database["public"]["Tables"]["compute_jobs"]["Row"];

const DISPATCH_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 60_000;
const MAX_ATTEMPTS = 2;

export type DispatchOutcome = {
  ok: boolean;
  status: number;
  body: unknown;
};

export async function claimNextJob(supabase: Supa): Promise<JobRow | null> {
  const nowIso = new Date().toISOString();
  const picked = await supabase
    .from("compute_jobs")
    .select("*")
    .eq("status", "queued")
    .lte("next_run_at", nowIso)
    .order("next_run_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (picked.error || !picked.data) {
    return null;
  }
  const candidate = picked.data;

  const claim = await supabase
    .from("compute_jobs")
    .update({
      status: "running",
      attempts: candidate.attempts + 1,
      updated_at: nowIso,
    })
    .eq("id", candidate.id)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();

  if (claim.error || !claim.data) {
    return null; // race-loss: another runner grabbed it
  }
  return claim.data;
}

export async function dispatchToAlgo(job: JobRow): Promise<DispatchOutcome> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DISPATCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${env.ALGO_BASE_URL}/compute`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.ALGO_BEARER_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ session_id: job.session_id }),
      signal: ctrl.signal,
    });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: { error: String(err) } };
  } finally {
    clearTimeout(timer);
  }
}

export async function markJobOutcome(
  supabase: Supa,
  job: JobRow,
  outcome: DispatchOutcome,
): Promise<void> {
  const nowIso = new Date().toISOString();

  if (outcome.status === 200) {
    await supabase
      .from("compute_jobs")
      .update({ status: "succeeded", updated_at: nowIso, last_error: null })
      .eq("id", job.id);
    return;
  }

  if (outcome.status === 409) {
    await supabase
      .from("compute_jobs")
      .update({
        status: "succeeded",
        updated_at: nowIso,
        last_error: "algo_409_terminal_success",
      })
      .eq("id", job.id);
    return;
  }

  const errMsg = `status=${outcome.status} body=${JSON.stringify(outcome.body)}`;

  if (job.attempts < MAX_ATTEMPTS) {
    await supabase
      .from("compute_jobs")
      .update({
        status: "queued",
        next_run_at: new Date(Date.now() + RETRY_DELAY_MS).toISOString(),
        last_error: errMsg,
        updated_at: nowIso,
      })
      .eq("id", job.id);
    return;
  }

  // Terminal failure: also flip sessions.metrics_status (Rule 9 — algo may
  // not have done it if /compute 5xx'd before its own status write).
  await supabase
    .from("compute_jobs")
    .update({ status: "failed", last_error: errMsg, updated_at: nowIso })
    .eq("id", job.id);
  await supabase
    .from("sessions")
    .update({ metrics_status: "failed" })
    .eq("id", job.session_id);
}

export async function claimAndDispatch(
  supabase: Supa,
): Promise<{ picked: number; dispatched: number; failed: number }> {
  const job = await claimNextJob(supabase);
  if (!job) {
    return { picked: 0, dispatched: 0, failed: 0 };
  }
  const outcome = await dispatchToAlgo(job);
  await markJobOutcome(supabase, job, outcome);
  const dispatched = outcome.status === 200 || outcome.status === 409 ? 1 : 0;
  const failed = outcome.status !== 200 && outcome.status !== 409 ? 1 : 0;
  return { picked: 1, dispatched, failed };
}
