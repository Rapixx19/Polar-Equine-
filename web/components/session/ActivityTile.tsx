import Link from "next/link";

import type { ActivityType } from "@/lib/activities";

const ACTIVITY_UI: Record<ActivityType, { emoji: string; label: string }> = {
  riding: { emoji: "🏇", label: "Riding" },
  lunging: { emoji: "🎯", label: "Lunging" },
  grass_field: { emoji: "🌳", label: "Field" },
  walker: { emoji: "🔄", label: "Walker" },
  stall: { emoji: "🏠", label: "Stall" },
  transport: { emoji: "🚚", label: "Transport" },
  vet: { emoji: "🩺", label: "Vet" },
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
      className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-center transition hover:border-[var(--lime)] active:bg-[var(--canvas)]"
    >
      <span aria-hidden className="text-4xl">
        {emoji}
      </span>
      <span className="text-sm font-medium text-[var(--text)]">{label}</span>
    </Link>
  );
}
