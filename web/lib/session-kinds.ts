// Rider-facing session kinds. One chip = one (activity_type, riding_subtype)
// tuple under the hood. Labels live here, not in the DB, so Ferdinand can
// rename / reorder / add chips without a migration. The `id` is what gets
// written to sessions.kind_id (migration 037) for round-tripping when the
// chip set evolves.

import type { ActivityType, RidingSubtype } from "@/lib/activities";

export type SessionKind = {
  id: string;
  label: string;
  emoji: string;
  activity_type: ActivityType;
  riding_subtype: RidingSubtype | null;
};

export const SESSION_KINDS: readonly SessionKind[] = [
  {
    id: "trot_only",
    label: "Trot only",
    emoji: "🐎",
    activity_type: "riding",
    riding_subtype: "flat_work",
  },
  {
    id: "gallop_only",
    label: "Gallop only",
    emoji: "💨",
    activity_type: "riding",
    riding_subtype: "flat_work",
  },
  {
    id: "gallop_jumps",
    label: "Gallop + jumps",
    emoji: "🚧",
    activity_type: "riding",
    riding_subtype: "light_jumping",
  },
  {
    id: "grass_feeding",
    label: "Grass feeding",
    emoji: "🌿",
    activity_type: "grass_field",
    riding_subtype: null,
  },
  {
    id: "box_standing",
    label: "Box standing",
    emoji: "🏠",
    activity_type: "stall",
    riding_subtype: null,
  },
  {
    id: "giostra",
    label: "Giostra",
    emoji: "🎠",
    activity_type: "walker",
    riding_subtype: null,
  },
  {
    id: "transport",
    label: "Transport",
    emoji: "🚚",
    activity_type: "transport",
    riding_subtype: null,
  },
] as const;

export type SessionKindId = (typeof SESSION_KINDS)[number]["id"];

export function findSessionKind(id: string | null | undefined): SessionKind | null {
  if (!id) return null;
  return SESSION_KINDS.find((k) => k.id === id) ?? null;
}
