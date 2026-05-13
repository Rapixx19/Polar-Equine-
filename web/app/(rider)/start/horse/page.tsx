import Link from "next/link";
import { redirect } from "next/navigation";

import { AddGuestHorseInline } from "@/components/session/AddGuestHorseInline";
import { AddHorseDialog } from "@/components/session/AddHorseDialog";
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
import {
  buildSessionStartUrl,
  getHorsesForRider,
  getRiderPreferredHorseId,
  sortHorsesWithPreferred,
  splitHorses,
} from "@/lib/horses/server";

const NOTE_MAX = 200;

function isActivityType(value: unknown): value is ActivityType {
  return typeof value === "string" && (ACTIVITY_TYPES as readonly string[]).includes(value);
}

function isRidingSubtype(value: unknown): value is RidingSubtype {
  return typeof value === "string" && (RIDING_SUBTYPES as readonly string[]).includes(value);
}

export default async function StartHorsePage({
  searchParams,
}: {
  searchParams: Promise<{ activity?: string; subtype?: string; note?: string }>;
}) {
  const params = await searchParams;
  if (!isActivityType(params.activity)) redirect("/home");
  const activity: ActivityType = params.activity;

  // V0.2: subtype is optional; bookmarked URLs may still pass one.
  const ridingFamily = activity === "riding" || activity === "lunging";
  const subtype: RidingSubtype | null = isRidingSubtype(params.subtype) ? params.subtype : null;

  let note: string | null = null;
  if (activity === "other") {
    const raw = typeof params.note === "string" ? params.note.trim() : "";
    if (raw.length === 0) redirect("/home");
    note = raw.slice(0, NOTE_MAX);
  }

  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) redirect("/");

  const [horses, preferredHorseId] = await Promise.all([
    getHorsesForRider(supabase),
    getRiderPreferredHorseId(supabase, user.id),
  ]);

  const { assigned, recentGuests } = splitHorses(horses);
  const sortedAssigned = sortHorsesWithPreferred(assigned, preferredHorseId);

  // Auto-route only when the rider has exactly one assigned horse and no
  // recent guests — otherwise they need the picker to choose among options
  // or add another one-off horse.
  if (sortedAssigned.length === 1 && recentGuests.length === 0) {
    redirect(
      buildSessionStartUrl({
        activity,
        horseId: sortedAssigned[0].id,
        subtype,
        note,
      }),
    );
  }

  const sessionTag =
    activity === "other" && note
      ? note
      : ridingFamily && subtype
        ? `${activityLabel(activity)} · ${RIDING_SUBTYPE_UI[subtype].label}`
        : activityLabel(activity);

  const empty = sortedAssigned.length === 0 && recentGuests.length === 0;

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto w-full max-w-lg">
        <Link
          href="/home"
          className="mb-6 inline-block text-sm text-[var(--text-muted)] hover:text-[var(--lime)]"
        >
          ← Back
        </Link>
        <p className="mb-1 text-xs uppercase tracking-wide text-[var(--text-faint)]">{sessionTag}</p>
        <h1 className="mb-6 text-2xl font-light">Which horse?</h1>

        {empty ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--text-muted)]">
            No horses yet. Add one below or ask your stable admin to grant you access.
          </div>
        ) : null}

        {sortedAssigned.length > 0 ? (
          <section className="mb-6">
            <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-faint)]">
              Your horses
            </p>
            <ul className="space-y-3">
              {sortedAssigned.map((horse) => (
                <li key={horse.id}>
                  <HorseTile
                    horse={horse}
                    activity={activity}
                    subtype={subtype}
                    note={note}
                    isPreferred={horse.isPreferred}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {recentGuests.length > 0 ? (
          <section className="mb-6">
            <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-faint)]">
              Recent one-time horses
            </p>
            <ul className="space-y-3">
              {recentGuests.map((horse) => (
                <li key={horse.id}>
                  <HorseTile
                    horse={horse}
                    activity={activity}
                    subtype={subtype}
                    note={note}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <AddGuestHorseInline />
        <AddHorseDialog />
      </div>
    </main>
  );
}
