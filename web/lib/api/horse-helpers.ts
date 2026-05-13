import { z } from "zod";

// POST /api/horses body. Trim before length-checking so " " ( 1 char of
// whitespace) collapses to "" and gets rejected. Upper bound mirrors the
// migration 021 RPC which raises 'invalid_name' for length > 80.
export const createHorseBody = z.object({
  name: z.string().trim().min(1).max(80),
  // V0.2 one-time / guest horses: when true the route calls the
  // create_guest_horse_for_self RPC (migration 024) so the new row is
  // stamped is_guest=true + last_used_at=now() and skips "My horses".
  is_guest: z.boolean().optional(),
});

export type CreateHorseBody = z.infer<typeof createHorseBody>;
