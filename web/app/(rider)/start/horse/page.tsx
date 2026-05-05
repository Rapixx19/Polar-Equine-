import Link from "next/link";
import { redirect } from "next/navigation";

import { HorseTile } from "@/components/session/HorseTile";
import { activityLabel } from "@/components/session/ActivityTile";
import { ACTIVITY_TYPES, type ActivityType } from "@/lib/activities";
import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { getHorsesForRider } from "@/lib/horses/server";

function isActivityType(value: unknown): value is ActivityType {
  return typeof value === "string" && (ACTIVITY_TYPES as readonly string[]).includes(value);
}

export default async function StartHorsePage({
  searchParams,
}: {
  searchParams: Promise<{ activity?: string }>;
}) {
  const params = await searchParams;
  if (!isActivityType(params.activity)) {
    redirect("/home");
  }
  const activity: ActivityType = params.activity;

  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) {
    redirect("/");
  }

  const horses = await getHorsesForRider(supabase);

  return (
    <main className="min-h-screen bg-stone-50 p-6 text-stone-900">
      <div className="mx-auto w-full max-w-lg">
        <Link href="/home" className="mb-6 inline-block text-sm text-stone-500 hover:text-stone-700">
          ← Back
        </Link>
        <h1 className="mb-1 text-2xl font-light">Which horse?</h1>
        <p className="mb-6 text-sm text-stone-500">{activityLabel(activity)}</p>

        {horses.length === 0 ? (
          <div className="rounded-2xl bg-white p-6 text-center text-sm text-stone-500 shadow-sm">
            No horses linked to your rider profile yet. Ask your stable admin to grant access.
          </div>
        ) : (
          <ul className="space-y-3">
            {horses.map((horse) => (
              <li key={horse.id}>
                <HorseTile horse={horse} activity={activity} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
