import { z } from "zod";

import { ACTIVITY_TYPES, RIDING_SUBTYPES } from "@/lib/activities";

// Cross-field invariants mirror the migration 017 CHECK constraints
// (sessions_riding_subtype_check, sessions_activity_note_check) so the
// API rejects malformed bodies before Postgres does. Keep the rules in
// sync if the constraints are changed.
export const createSessionBody = z
  .object({
    horse_id: z.string().uuid(),
    band_id: z.string().uuid().nullable().optional(),
    activity_type: z.enum(ACTIVITY_TYPES),
    riding_subtype: z.enum(RIDING_SUBTYPES).nullable().optional(),
    activity_note: z.string().nullable().optional(),
    client_session_id: z.string().uuid(),
    has_prototype_mount: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    const ridingFamily = val.activity_type === "riding" || val.activity_type === "lunging";
    if (val.riding_subtype != null && !ridingFamily) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["riding_subtype"],
        message: "riding_subtype is only valid for activity_type 'riding' or 'lunging'",
      });
    }
    if (val.activity_type === "other") {
      const note = val.activity_note;
      if (note == null || note.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["activity_note"],
          message: "activity_note is required when activity_type is 'other'",
        });
      } else if (note.length > 200) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["activity_note"],
          message: "activity_note must be 200 characters or fewer",
        });
      }
    } else if (val.activity_note != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["activity_note"],
        message: "activity_note is only allowed when activity_type is 'other'",
      });
    }
  });
export type CreateSessionBody = z.infer<typeof createSessionBody>;

const endAction = z.object({
  action: z.literal("end"),
  notes: z.string().max(2000).optional(),
});
const notesOnly = z.object({
  notes: z.string().max(2000),
});
// Rider picks the kind (and optionally notes) after End. Maps to a fresh
// (activity_type, riding_subtype) + tag id. Triggers a recompute when it
// changes the row vs. what was set at start.
const finalizeAction = z.object({
  action: z.literal("finalize"),
  kind_id: z.string().min(1).max(64),
  activity_type: z.enum(ACTIVITY_TYPES),
  riding_subtype: z.enum(RIDING_SUBTYPES).nullable().optional(),
  notes: z.string().max(2000).optional(),
});

export const patchSessionBody = z.union([endAction, notesOnly, finalizeAction]);
export type PatchSessionBody = z.infer<typeof patchSessionBody>;

export const sessionIdParam = z.string().uuid();
