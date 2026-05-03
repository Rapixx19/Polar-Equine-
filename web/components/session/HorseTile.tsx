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
      className="flex items-center justify-between rounded-2xl bg-white px-4 py-4 shadow-sm transition hover:bg-stone-100 active:bg-stone-200"
    >
      <span className="text-base font-medium text-stone-800">{horse.name}</span>
      <span aria-hidden className="text-stone-400">
        ›
      </span>
    </Link>
  );
}
