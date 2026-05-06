import Link from "next/link";
import { redirect } from "next/navigation";

import { activityLabel } from "@/components/session/ActivityTile";
import { SubTypePicker } from "@/components/session/SubTypePicker";
import type { ActivityType } from "@/lib/activities";
import { createServerSupabaseClient, getUser } from "@/lib/auth/server";

function isRidingFamily(value: unknown): value is ActivityType {
  return value === "riding" || value === "lunging";
}

export default async function SubtypePage({
  searchParams,
}: {
  searchParams: Promise<{ activity?: string }>;
}) {
  const params = await searchParams;
  if (!isRidingFamily(params.activity)) redirect("/home");
  const activity: ActivityType = params.activity;

  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) redirect("/");

  const heading = activity === "riding" ? "What kind of riding?" : "What kind of lunging?";

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto w-full max-w-lg">
        <Link
          href="/home"
          className="mb-6 inline-block text-sm text-[var(--text-muted)] hover:text-[var(--lime)]"
        >
          ← Back
        </Link>
        <p className="mb-1 text-xs uppercase tracking-wide text-[var(--text-faint)]">
          {activityLabel(activity)}
        </p>
        <h1 className="mb-6 text-2xl font-light">{heading}</h1>
        <SubTypePicker activity={activity} />
      </div>
    </main>
  );
}
