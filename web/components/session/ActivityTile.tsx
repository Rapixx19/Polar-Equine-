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

// Riding and lunging both go through the sub-type picker first
// (`/session/new/subtype?activity=...`); everything else routes straight
// to the horse picker. Slice 11.8 Stage 3 added the primary variant;
// Stage 4 wires the subtype detour.
export function ActivityTile({
  activity,
  variant = "standard",
}: {
  activity: ActivityType;
  variant?: "standard" | "primary";
}) {
  const { emoji, label, desc } = ACTIVITY_UI[activity];
  const ridingFamily = activity === "riding" || activity === "lunging";
  const href = ridingFamily
    ? `/session/new/subtype?activity=${activity}`
    : `/start/horse?activity=${activity}`;

  if (variant === "primary") {
    return (
      <Link
        href={href}
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
      href={href}
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
