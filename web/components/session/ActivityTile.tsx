import type { ActivityType } from "@/lib/activities";

const ACTIVITY_LABEL: Record<ActivityType, string> = {
  riding: "Riding",
  lunging: "Lunging",
  grass_field: "Field",
  walker: "Walker",
  stall: "Stall",
  transport: "Transport",
  vet: "Vet",
  other: "Other",
};

export function activityLabel(activity: ActivityType): string {
  return ACTIVITY_LABEL[activity];
}
