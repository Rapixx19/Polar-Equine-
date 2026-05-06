import { activityLabel } from "@/components/session/ActivityTile";
import {
  RIDING_SUBTYPE_UI,
  type ActivityType,
  type RidingSubtype,
} from "@/lib/activities";

type Props = {
  activity: ActivityType;
  ridingSubtype?: RidingSubtype | null;
  activityNote?: string | null;
};

const NOTE_DISPLAY_MAX = 40;

export function buildChipParts(
  activity: ActivityType,
  ridingSubtype: RidingSubtype | null,
  activityNote: string | null,
): string[] {
  const parts: string[] = [activityLabel(activity)];
  if ((activity === "riding" || activity === "lunging") && ridingSubtype) {
    parts.push(RIDING_SUBTYPE_UI[ridingSubtype].label);
  } else if (activity === "other" && activityNote) {
    const trimmed = activityNote.trim();
    if (trimmed.length > 0) {
      parts.push(
        trimmed.length > NOTE_DISPLAY_MAX
          ? `${trimmed.slice(0, NOTE_DISPLAY_MAX - 1)}…`
          : trimmed,
      );
    }
  }
  return parts;
}

export function SessionContextChip({
  activity,
  ridingSubtype = null,
  activityNote = null,
}: Props) {
  const parts = buildChipParts(activity, ridingSubtype, activityNote);
  return (
    <div
      data-testid="session-context-chip"
      className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs text-[var(--text-muted)]"
    >
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && (
            <span aria-hidden className="text-[var(--text-faint)]">
              ·
            </span>
          )}
          <span>{part}</span>
        </span>
      ))}
    </div>
  );
}
