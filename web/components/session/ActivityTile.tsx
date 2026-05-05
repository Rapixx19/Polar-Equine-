import Link from "next/link";

import type { ActivityType } from "@/lib/activities";

const ACTIVITY_UI: Record<ActivityType, { emoji: string; label: string }> = {
  riding: { emoji: "🏇", label: "Riding session" },
  grass_field: { emoji: "🌳", label: "Field rest" },
  walker: { emoji: "🔄", label: "Walker" },
  stall: { emoji: "🏠", label: "Stall rest" },
  transport: { emoji: "🚚", label: "Transport" },
  vet: { emoji: "🩺", label: "Vet visit" },
  other: { emoji: "✨", label: "Other" },
};

export function activityLabel(activity: ActivityType): string {
  return ACTIVITY_UI[activity].label;
}

export function ActivityTile({ activity }: { activity: ActivityType }) {
  const { emoji, label } = ACTIVITY_UI[activity];
  return (
    <Link
      href={`/start/horse?activity=${activity}`}
      className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl bg-white p-4 text-center shadow-sm transition hover:bg-stone-100 active:bg-stone-200"
    >
      <span aria-hidden className="text-4xl">
        {emoji}
      </span>
      <span className="text-sm font-medium text-stone-800">{label}</span>
    </Link>
  );
}
