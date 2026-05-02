export const ACTIVITY_TYPES = [
  "riding",
  "grass_field",
  "walker",
  "stall",
  "transport",
  "vet",
  "other",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];
