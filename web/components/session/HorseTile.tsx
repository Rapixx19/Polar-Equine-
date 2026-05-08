import Link from "next/link";

import { buildSessionStartUrl, type HorseOption } from "@/lib/horses/server";
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
  const href = buildSessionStartUrl({
    activity,
    horseId: horse.id,
    subtype,
    note,
  });
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 transition hover:border-[var(--lime)] active:bg-[var(--canvas)]"
    >
      <span className="text-base font-medium text-[var(--text)]">{horse.name}</span>
      <span aria-hidden className="text-[var(--text-faint)]">
        ›
      </span>
    </Link>
  );
}
