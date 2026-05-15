// Shared constants for the live-label channel. The list mirrors the
// CHECK constraint on session_live_labels.label (migration 033).

export const LIVE_LABELS = ["halt", "walk", "trot", "canter", "jump"] as const;
export type LiveLabel = (typeof LIVE_LABELS)[number];
