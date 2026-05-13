import { redirect } from "next/navigation";

import { activityLabel } from "@/components/session/ActivityTile";
import type { ActivityType } from "@/lib/activities";
import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { isEditWindowOpen } from "@/lib/api/label-helpers";
import {
  classifySession,
  GAIT_CLASSIFIER_ALGO_VERSION,
} from "@/lib/session/gait-classifier";
import { fetchSessionHRSamples } from "@/lib/session/hr-fetch";
import { formatDuration } from "@/lib/session/segments";

import { ReviewClient } from "./ReviewClient";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SessionReviewPage({
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
    .select("id, created_at, start_time, end_time, status, activity_type, horse:horses(name)")
    .eq("id", id)
    .maybeSingle();

  if (!sessionRow) redirect("/home");
  if (sessionRow.status !== "completed") redirect(`/session/${id}/saved`);
  if (!sessionRow.created_at || !isEditWindowOpen(sessionRow.created_at)) {
    redirect(`/session/${id}/saved`);
  }

  const start = new Date(sessionRow.start_time).getTime();
  const end = sessionRow.end_time ? new Date(sessionRow.end_time).getTime() : start;
  const durationMs = Math.max(0, end - start);

  const samples = await fetchSessionHRSamples(supabase, id, sessionRow.start_time);
  const segments = classifySession(samples, durationMs);

  const horseRel = (sessionRow.horse ?? null) as { name: string } | { name: string }[] | null;
  const horse = Array.isArray(horseRel) ? (horseRel[0] ?? null) : horseRel;

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg p-5 pb-32">
      <header className="mb-5">
        <p className="text-xs uppercase tracking-wide text-[var(--lime)]">Label your ride</p>
        <h1 className="mt-1 text-2xl font-light">
          What did {horse?.name ?? "your horse"} do?
        </h1>
        <p className="mt-1 text-sm text-[var(--text-faint)]">
          {activityLabel(sessionRow.activity_type as ActivityType)} · {formatDuration(durationMs)}
        </p>
      </header>

      <ReviewClient
        sessionId={id}
        samples={samples}
        autoSegments={segments}
        algoVersion={GAIT_CLASSIFIER_ALGO_VERSION}
      />
    </main>
  );
}
