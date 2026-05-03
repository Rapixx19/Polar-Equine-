import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

// Server-only Supabase client built from the service-role key. Bypasses RLS —
// only import from cron / admin routes that have already authenticated the
// caller (e.g. CRON_SECRET bearer). Never expose to the browser.
export function createServiceRoleClient(): SupabaseClient<Database> {
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
