import Link from "next/link";
import { redirect } from "next/navigation";

import { HorseTile } from "@/components/session/HorseTile";
import { activityLabel } from "@/components/session/ActivityTile";
import {
  ACTIVITY_TYPES,
  RIDING_SUBTYPES,
  RIDING_SUBTYPE_UI,
  type ActivityType,
  type RidingSubtype,
} from "@/lib/activities";
import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { getHorsesForRider } from "@/lib/horses/server";

const NOTE_MAX = 200;

function isActivityType(value: unknown): value is ActivityType {
  return typeof value === "string" && (ACTIVITY_TYPES as readonly string[]).includes(value);
}

function isRidingSubtype(value: unknown): value is RidingSubtype {
  return typeof value === "string" && (RIDING_SUBTYPES as readonly string[]).includes(value);
}

function backHrefFor(activity: ActivityType): string {
  if (activity === "riding" || activity === "lunging") {
    return `/session/new/subtype?activity=${activity}`;
  }
  if (activity === "other") {
    return "/session/new/custom";
  }
  return "/home";
}

export default async function StartHorsePage({
  searchParams,
}: {
  searchParams: Promise<{ activity?: string; subtype?: string; note?: string }>;
}) {
  const params = await searchParams;
  if (!isActivityType(params.activity)) {
    redirect("/home");
  }
  const activity: ActivityType = params.activity;

  // riding & lunging require a subtype (the home tile routes through the
  // sub-type picker — landing here without one means a manual URL fiddle).
  const ridingFamily = activity === "riding" || activity === "lunging";
  const subtype: RidingSubtype | null = isRidingSubtype(params.subtype) ? params.subtype : null;
  if (ridingFamily && !subtype) {
    redirect(`/session/new/subtype?activity=${activity}`);
  }

  // 'other' requires a non-empty note (≤200 chars). Strip + clamp.
  let note: string | null = null;
  if (activity === "other") {
    const raw = typeof params.note === "string" ? params.note.trim() : "";
    if (raw.length === 0) redirect("/session/new/custom");
    note = raw.slice(0, NOTE_MAX);
  }

  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) {
    redirect("/");
  }

  const horses = await getHorsesForRider(supabase);

  const sessionTag =
    activity === "other" && note
      ? note
      : ridingFamily && subtype
        ? `${activityLabel(activity)} · ${RIDING_SUBTYPE_UI[subtype].label}`
        : activityLabel(activity);

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto w-full max-w-lg">
        <Link
          href={backHrefFor(activity)}
          className="mb-6 inline-block text-sm text-[var(--text-muted)] hover:text-[var(--lime)]"
        >
          ← Back
        </Link>
        <p className="mb-1 text-xs uppercase tracking-wide text-[var(--text-faint)]">{sessionTag}</p>
        <h1 className="mb-6 text-2xl font-light">Which horse?</h1>

        {horses.length === 0 ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--text-muted)]">
            No horses linked to your rider profile yet. Ask your stable admin to grant access.
          </div>
        ) : (
          <ul className="space-y-3">
            {horses.map((horse) => (
              <li key={horse.id}>
                <HorseTile horse={horse} activity={activity} subtype={subtype} note={note} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
