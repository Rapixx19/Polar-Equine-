import { redirect } from "next/navigation";

import { SessionRecorder } from "@/components/session/SessionRecorder";
import { ACTIVITY_TYPES, type ActivityType } from "@/lib/activities";
import { createServerSupabaseClient, getUser } from "@/lib/auth/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isActivityType(value: unknown): value is ActivityType {
  return typeof value === "string" && (ACTIVITY_TYPES as readonly string[]).includes(value);
}

export default async function SessionNewPage({
  searchParams,
}: {
  searchParams: Promise<{ activity?: string; horse_id?: string }>;
}) {
  const params = await searchParams;
  if (!isActivityType(params.activity)) redirect("/home");
  if (!params.horse_id || !UUID_RE.test(params.horse_id)) redirect("/home");
  const activity: ActivityType = params.activity;
  const horseId = params.horse_id;

  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) redirect("/");

  // RLS-scoped: returns null if the rider isn't linked to this horse.
  // Same query needed for display anyway, so this is not an extra round-trip.
  const { data: horse } = await supabase
    .from("horses")
    .select("id, name")
    .eq("id", horseId)
    .maybeSingle();

  if (!horse) redirect(`/start/horse?activity=${activity}`);

  return (
    <main className="min-h-screen bg-stone-50 p-6 text-stone-900">
      <SessionRecorder horse={{ id: horse.id, name: horse.name }} activity={activity} />
    </main>
  );
}
