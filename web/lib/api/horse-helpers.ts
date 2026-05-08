import { z } from "zod";

// POST /api/horses body. Trim before length-checking so " " ( 1 char of
// whitespace) collapses to "" and gets rejected. Upper bound mirrors the
// migration 021 RPC which raises 'invalid_name' for length > 80.
export const createHorseBody = z.object({
  name: z.string().trim().min(1).max(80),
});

export type CreateHorseBody = z.infer<typeof createHorseBody>;
