import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { LogoutButton } from "@/components/auth/LogoutButton";
import { activityLabel } from "@/components/session/ActivityTile";
import type { ActivityType } from "@/lib/activities";
import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { sessionInsightsTable, type SessionInsightRow } from "@/lib/insights/insights-table";
import type { GaitLabel } from "@/lib/session/segments";

import { SessionDetailClient } from "./SessionDetailClient";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SessionRow = {
  id: string;
  rider_id: string;
  horse_id: string;
  activity_type: ActivityType;
  start_time: string;
  end_time: string | null;
  status: string;
  horses: { name: string | null } | null;
  rider_profiles: { display_name: string | null } | null;
};

function durationLabel(start: string, end: string | null): string {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return `${Math.round(ms / 60_000)} min`;
}

export default async function AdminSessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) redirect("/");

  const { data: me } = await supabase
    .from("rider_profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.is_admin) redirect("/home");

  const { data: sessionRow } = await supabase
    .from("sessions")
    .select(
      "id, rider_id, horse_id, activity_type, start_time, end_time, status, horses(name), rider_profiles(display_name)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!sessionRow) notFound();
  const session = sessionRow as unknown as SessionRow;

  const [samplesRes, metricsRes, labelsRes, insightRes, hrCount, accCount, ecgCount, autoLabelCount] =
    await Promise.all([
      supabase
        .from("samples_hr")
        .select("timestamp_ms, hr_bpm")
        .eq("session_id", id)
        .order("timestamp_ms", { ascending: true }),
      supabase.from("session_metrics").select("*").eq("session_id", id).maybeSingle(),
      supabase
        .from("label_corrections")
        .select(
          "auto_start_ms, auto_end_ms, auto_label_type, corrected_start_ms, corrected_end_ms, corrected_label_type, corrected_jump_count, correction_kind",
        )
        .eq("session_id", id)
        .order("auto_start_ms", { ascending: true }),
      sessionInsightsTable(supabase)
        .select(
          "insight_markdown, model, prompt_version, input_token_count, output_token_count, generated_at",
        )
        .eq("session_id", id)
        .maybeSingle(),
      supabase.from("samples_hr").select("*", { count: "exact", head: true }).eq("session_id", id),
      supabase.from("samples_acc").select("*", { count: "exact", head: true }).eq("session_id", id),
      supabase.from("samples_ecg").select("*", { count: "exact", head: true }).eq("session_id", id),
      supabase.from("labels").select("*", { count: "exact", head: true }).eq("session_id", id),
    ]);

  const sourceCounts = {
    samples_hr: hrCount.count ?? 0,
    samples_acc: accCount.count ?? 0,
    samples_ecg: ecgCount.count ?? 0,
    labels_auto: autoLabelCount.count ?? 0,
    label_corrections: (labelsRes.data ?? []).length,
    session_metrics: metricsRes.data ? 1 : 0,
  };

  const insightRow = insightRes.data as Pick<
    SessionInsightRow,
    "insight_markdown" | "model" | "prompt_version" | "input_token_count" | "output_token_count" | "generated_at"
  > | null;
  const initialInsight = insightRow
    ? {
        markdown: insightRow.insight_markdown,
        model: insightRow.model,
        prompt_version: insightRow.prompt_version,
        input_tokens: insightRow.input_token_count,
        output_tokens: insightRow.output_token_count,
        generated_at: insightRow.generated_at,
        cached: true,
      }
    : null;

  const samples = (samplesRes.data ?? []).map((s) => ({
    ts_ms: Number(s.timestamp_ms),
    bpm: Number(s.hr_bpm ?? 0),
  }));
  const labels = (labelsRes.data ?? []).map((l) => ({
    start_ms: Number(l.corrected_start_ms ?? l.auto_start_ms),
    end_ms: Number(l.corrected_end_ms ?? l.auto_end_ms),
    label: (l.corrected_label_type ?? l.auto_label_type) as GaitLabel,
    jump_count: Number(l.corrected_jump_count ?? 0),
    correction_kind: String(l.correction_kind ?? ""),
  }));
  const metrics = (metricsRes.data ?? null) as Record<string, unknown> | null;

  const durationMs = session.end_time
    ? new Date(session.end_time).getTime() - new Date(session.start_time).getTime()
    : undefined;

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--text-faint)]">Admin · Session</p>
            <h1 className="text-2xl font-light">
              {session.rider_profiles?.display_name ?? "—"} ·{" "}
              {session.horses?.name ?? "—"}
            </h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/admin/sessions" className="text-[var(--text-muted)] hover:text-[var(--lime)]">
              ← All sessions
            </Link>
            <LogoutButton />
          </div>
        </header>

        <dl className="mb-6 grid grid-cols-2 gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm md:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-[var(--text-faint)]">Started</dt>
            <dd>{new Date(session.start_time).toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-[var(--text-faint)]">Duration</dt>
            <dd>{durationLabel(session.start_time, session.end_time)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-[var(--text-faint)]">Activity</dt>
            <dd>{activityLabel(session.activity_type)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-[var(--text-faint)]">Status</dt>
            <dd className="text-[var(--text-muted)]">{session.status}</dd>
          </div>
        </dl>

        <SessionDetailClient
          sessionId={session.id}
          samples={samples}
          labels={labels}
          metrics={metrics}
          durationMs={durationMs}
          initialInsight={initialInsight}
          sourceCounts={sourceCounts}
        />
      </div>
    </main>
  );
}
