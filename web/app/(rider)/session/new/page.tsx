import { redirect } from "next/navigation";

import { SessionRecorder } from "@/components/session/SessionRecorder";
import {
  ACTIVITY_TYPES,
  RIDING_SUBTYPES,
  type ActivityType,
  type RidingSubtype,
} from "@/lib/activities";
import { createServerSupabaseClient, getUser } from "@/lib/auth/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTE_MAX = 200;

function isActivityType(value: unknown): value is ActivityType {
  return typeof value === "string" && (ACTIVITY_TYPES as readonly string[]).includes(value);
}

function isRidingSubtype(value: unknown): value is RidingSubtype {
  return typeof value === "string" && (RIDING_SUBTYPES as readonly string[]).includes(value);
}

export default async function SessionNewPage({
  searchParams,
}: {
  searchParams: Promise<{
    activity?: string;
    horse_id?: string;
    subtype?: string;
    note?: string;
  }>;
}) {
  const params = await searchParams;
  if (!isActivityType(params.activity)) redirect("/home");
  if (!params.horse_id || !UUID_RE.test(params.horse_id)) redirect("/home");
  const activity: ActivityType = params.activity;
  const horseId = params.horse_id;

  // riding & lunging must arrive with a valid subtype (forwarded from
  // /session/new/subtype). Bare URLs go back to the picker.
  const ridingFamily = activity === "riding" || activity === "lunging";
  const subtype: RidingSubtype | null = isRidingSubtype(params.subtype) ? params.subtype : null;
  if (ridingFamily && !subtype) {
    redirect(`/session/new/subtype?activity=${activity}`);
  }

  // 'other' requires a 1–200 char note.
  let note: string | null = null;
  if (activity === "other") {
    const raw = typeof params.note === "string" ? params.note.trim() : "";
    if (raw.length === 0) redirect("/session/new/custom");
    note = raw.slice(0, NOTE_MAX);
  }

  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) redirect("/");

  // RLS-scoped: returns null if the rider isn't linked to this horse.
  const { data: horse } = await supabase
    .from("horses")
    .select("id, name")
    .eq("id", horseId)
    .maybeSingle();

  if (!horse) redirect(`/start/horse?activity=${activity}`);

  return (
    <main className="min-h-screen p-6">
      <SessionRecorder
        horse={{ id: horse.id, name: horse.name }}
        activity={activity}
        ridingSubtype={subtype}
        activityNote={note}
      />
    </main>
  );
}
