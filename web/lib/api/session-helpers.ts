import { z } from "zod";

import { ACTIVITY_TYPES } from "@/lib/activities";

export const createSessionBody = z.object({
  horse_id: z.string().uuid(),
  band_id: z.string().uuid().nullable().optional(),
  activity_type: z.enum(ACTIVITY_TYPES),
  client_session_id: z.string().uuid(),
});
export type CreateSessionBody = z.infer<typeof createSessionBody>;

const endAction = z.object({
  action: z.literal("end"),
  notes: z.string().max(2000).optional(),
});
const notesOnly = z.object({
  notes: z.string().max(2000),
});

export const patchSessionBody = z.union([endAction, notesOnly]);
export type PatchSessionBody = z.infer<typeof patchSessionBody>;

export const sessionIdParam = z.string().uuid();
