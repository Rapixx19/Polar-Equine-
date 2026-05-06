import Link from "next/link";

import type { ActivityType } from "@/lib/activities";

const ACTIVITY_UI: Record<ActivityType, { emoji: string; label: string; desc: string }> = {
  riding: { emoji: "🏇", label: "Riding", desc: "Choose session type ›" },
  lunging: { emoji: "🎯", label: "Lunging", desc: "Unmounted" },
  grass_field: { emoji: "🌳", label: "Field", desc: "Turnout" },
  walker: { emoji: "🔄", label: "Walker", desc: "Mechanical" },
  stall: { emoji: "🏠", label: "Stall", desc: "Box rest" },
  transport: { emoji: "🚚", label: "Transport", desc: "In trailer" },
  vet: { emoji: "🩺", label: "Vet", desc: "Examination" },
  other: { emoji: "✨", label: "Other", desc: "Something else" },
};

export function activityLabel(activity: ActivityType): string {
  return ACTIVITY_UI[activity].label;
}

// Riding renders as a full-width primary tile that links straight into the
// sub-type picker; everything else is a square tile that posts the session
// from the home page. Slice 11.8 Stage 3.
export function ActivityTile({
  activity,
  variant = "standard",
}: {
  activity: ActivityType;
  variant?: "standard" | "primary";
}) {
  const { emoji, label, desc } = ACTIVITY_UI[activity];

  if (variant === "primary") {
    return (
      <Link
        href={`/start/horse?activity=${activity}`}
        className="col-span-2 flex items-center justify-between rounded-2xl border border-[var(--lime)] bg-[var(--surface)] p-4 transition hover:bg-[var(--canvas)]"
      >
        <span className="flex items-center gap-3">
          <span aria-hidden className="text-3xl">
            {emoji}
          </span>
          <span className="text-base font-medium text-[var(--text)]">{label}</span>
        </span>
        <span className="text-xs text-[var(--text-muted)]">{desc}</span>
      </Link>
    );
  }

  return (
    <Link
      href={`/start/horse?activity=${activity}`}
      className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-center transition hover:border-[var(--lime)] active:bg-[var(--canvas)]"
    >
      <span aria-hidden className="text-3xl">
        {emoji}
      </span>
      <span className="text-sm font-medium text-[var(--text)]">{label}</span>
      <span className="text-xs text-[var(--text-faint)]">{desc}</span>
    </Link>
  );
}
