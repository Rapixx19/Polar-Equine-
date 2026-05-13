import Link from "next/link";
import { redirect } from "next/navigation";

import { activityLabel } from "@/components/session/ActivityTile";
import { QualitySummary } from "@/components/session/QualitySummary";
import type { ActivityType } from "@/lib/activities";
import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import {
  formatDuration,
  savedView,
  type SavedSession,
} from "@/lib/sessions/saved-summary";

import { AnalyzingClient } from "./AnalyzingClient";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SessionSavedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) redirect("/home");

  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) redirect("/");

  const { data: sessionRow } = await supabase
    .from("sessions")
    .select(
      "id, activity_type, start_time, end_time, status, metrics_status, horse:horses(name)",
    )
    .eq("id", id)
    .maybeSingle();

  const horseRel = (sessionRow?.horse ?? null) as
    | { name: string }
    | { name: string }[]
    | null;
  const horse = Array.isArray(horseRel) ? (horseRel[0] ?? null) : horseRel;
  const session: SavedSession | null = sessionRow
    ? {
        id: sessionRow.id,
        activity_type: sessionRow.activity_type as ActivityType,
        start_time: sessionRow.start_time,
        end_time: sessionRow.end_time,
        status: sessionRow.status as SavedSession["status"],
        metrics_status: sessionRow.metrics_status as SavedSession["metrics_status"],
        horse,
      }
    : null;

  const view = savedView(session);
  if (view === "redirect" || !session) redirect("/home");

  if (view === "analyzing") {
    return <AnalyzingClient sessionId={session.id} horseName={horse?.name ?? "your horse"} />;
  }

  // summary view (status='approved' or metrics_status='complete'/'failed')
  const { count: sampleCount } = await supabase
    .from("samples_hr")
    .select("*", { count: "exact", head: true })
    .eq("session_id", session.id);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 text-5xl text-[var(--lime)]">✓</div>
        <h1 className="mb-2 text-2xl font-light">Session saved</h1>
        <p className="mb-8 text-sm text-[var(--text-faint)]">
          {horse?.name ?? "Horse"} · {activityLabel(session.activity_type)}
        </p>

        <dl className="mb-10 space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-left">
          <div className="flex justify-between">
            <dt className="text-sm text-[var(--text-faint)]">Duration</dt>
            <dd className="text-sm font-medium tabular-nums">
              {formatDuration(session.start_time, session.end_time)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm text-[var(--text-faint)]">Samples recorded</dt>
            <dd className="text-sm font-medium tabular-nums">{sampleCount ?? 0}</dd>
          </div>
        </dl>

        <div className="mb-6">
          <QualitySummary sessionId={session.id} />
        </div>

        <Link
          href="/home"
          className="inline-block rounded-md bg-[var(--lime)] px-6 py-2.5 text-sm font-medium text-[var(--canvas)] transition hover:opacity-90"
        >
          Done
        </Link>
      </div>
    </main>
  );
}
