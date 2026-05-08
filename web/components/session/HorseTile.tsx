import Link from "next/link";

import { buildSessionStartUrl, type HorseOption } from "@/lib/horses/server";
import type { RidingSubtype } from "@/lib/activities";

export function HorseTile({
  horse,
  activity,
  subtype,
  note,
  isPreferred = false,
}: {
  horse: HorseOption;
  activity: string;
  subtype?: RidingSubtype | null;
  note?: string | null;
  isPreferred?: boolean;
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
      <span className="flex items-center gap-3">
        <span className="text-base font-medium text-[var(--text)]">{horse.name}</span>
        {isPreferred ? (
          <span className="text-xs uppercase tracking-wide text-[var(--text-faint)]">
            Last used
          </span>
        ) : null}
      </span>
      <span aria-hidden className="text-[var(--text-faint)]">
        ›
      </span>
    </Link>
  );
}
