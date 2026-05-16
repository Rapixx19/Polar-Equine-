// Shared constants for the live-label channel. The list mirrors the
// CHECK constraint on session_live_labels.label (migration 034).

export const LIVE_LABELS = ["warm_up", "walk", "trot", "gallop", "jump"] as const;
export type LiveLabel = (typeof LIVE_LABELS)[number];

// Jump rows carry a count (combinations: "two jumps in a row" = 2). Riders pick
// from this set; the API still accepts any 1..20 in case we add an "other" pad.
export const JUMP_COUNT_OPTIONS = [1, 2, 3, 4, 5] as const;
export const JUMP_COUNT_MIN = 1;
export const JUMP_COUNT_MAX = 20;
