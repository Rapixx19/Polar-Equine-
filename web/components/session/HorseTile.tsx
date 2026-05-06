import Link from "next/link";

import type { HorseOption } from "@/lib/horses/server";
import type { RidingSubtype } from "@/lib/activities";

export function HorseTile({
  horse,
  activity,
  subtype,
  note,
}: {
  horse: HorseOption;
  activity: string;
  subtype?: RidingSubtype | null;
  note?: string | null;
}) {
  const params = new URLSearchParams({ activity, horse_id: horse.id });
  if (subtype) params.set("subtype", subtype);
  if (note) params.set("note", note);
  return (
    <Link
      href={`/session/new?${params.toString()}`}
      className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 transition hover:border-[var(--lime)] active:bg-[var(--canvas)]"
    >
      <span className="text-base font-medium text-[var(--text)]">{horse.name}</span>
      <span aria-hidden className="text-[var(--text-faint)]">
        ›
      </span>
    </Link>
  );
}
