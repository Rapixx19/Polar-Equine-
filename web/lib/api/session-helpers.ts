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

// Subjective free-text fields shared by the "end session" call and the
// post-ride edit form on the saved-session page. All three are independent
// — the rider can fill any combination on either path.
const SUBJECTIVE_FIELDS = {
  notes: z.string().max(2000).optional(),
  horse_feel: z.string().max(2000).optional(),
  cooldown_notes: z.string().max(2000).optional(),
} as const;

const endAction = z.object({
  action: z.literal("end"),
  ...SUBJECTIVE_FIELDS,
});
const subjectiveOnly = z
  .object(SUBJECTIVE_FIELDS)
  .refine(
    (v) =>
      v.notes !== undefined ||
      v.horse_feel !== undefined ||
      v.cooldown_notes !== undefined,
    { message: "at least one of notes / horse_feel / cooldown_notes is required" },
  );

export const patchSessionBody = z.union([endAction, subjectiveOnly]);
export type PatchSessionBody = z.infer<typeof patchSessionBody>;

export const sessionIdParam = z.string().uuid();
