import Link from "next/link";

import type { HorseOption } from "@/lib/horses/server";

export function HorseTile({
  horse,
  activity,
}: {
  horse: HorseOption;
  activity: string;
}) {
  return (
    <Link
      href={`/session/new?activity=${activity}&horse_id=${horse.id}`}
      className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 transition hover:border-[var(--lime)] active:bg-[var(--canvas)]"
    >
      <span className="text-base font-medium text-[var(--text)]">{horse.name}</span>
      <span aria-hidden className="text-[var(--text-faint)]">
        ›
      </span>
    </Link>
  );
}
