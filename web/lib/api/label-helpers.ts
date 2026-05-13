import { z } from "zod";

import { GAIT_LABELS } from "@/lib/session/segments";

// Edit window for label review — measured from session.created_at (UTC).
// 24h chosen instead of "local midnight" so we don't need a per-rider timezone
// column. Same memory-freshness intent. Late-evening sessions get up to 24h
// instead of being cut short by an arbitrary local midnight.
export const LABEL_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

// The body carries both the auto-label the classifier produced AND the rider's
// (possibly identical) corrected_label. correction_kind is derived server-side
// from whether they match — that way the client can't lie about it.
const blockSchema = z
  .object({
    start_ms: z.number().int().nonnegative(),
    end_ms: z.number().int().positive(),
    auto_label: z.enum(GAIT_LABELS),
    corrected_label: z.enum(GAIT_LABELS),
    jump_count: z.number().int().min(0).max(50),
  })
  .refine((b) => b.end_ms > b.start_ms, {
    path: ["end_ms"],
    message: "end_ms must be greater than start_ms",
  });

// algo_version is supplied by the server-rendered review page and round-tripped
// through the client so we record which classifier produced the auto-labels the
// rider reacted to. Bumping the classifier bumps this string (Rule 13).
//
// notes is the rider's free-text "what was this session about" — saved on the
// session row alongside the labels. Optional; empty/whitespace strings are
// dropped server-side. 500 chars matches a generous training-log line; longer
// stays in the rider's head.
export const SESSION_NOTES_MAX = 500;
export const approveLabelsBody = z.object({
  algo_version: z.string().min(1).max(64),
  blocks: z.array(blockSchema).min(1).max(64),
  notes: z.string().max(SESSION_NOTES_MAX).optional(),
});

export type ApproveLabelsBody = z.infer<typeof approveLabelsBody>;

export function isEditWindowOpen(createdAtIso: string, now: Date = new Date()): boolean {
  const created = new Date(createdAtIso).getTime();
  if (!Number.isFinite(created)) return false;
  return now.getTime() < created + LABEL_EDIT_WINDOW_MS;
}
