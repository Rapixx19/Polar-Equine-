import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

export type TypedSupabaseClient = SupabaseClient<Database>;

export type AdminProfile = {
  id: string;
  display_name: string | null;
  is_admin: boolean;
};

export async function createServerSupabaseClient(): Promise<TypedSupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          // In Server Components the cookie store is read-only — the middleware
          // refreshes the session in that case, so swallow the throw.
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // no-op; refresh path runs in middleware.ts
          }
        },
      },
    },
  );
}

export async function getUser(supabase: TypedSupabaseClient): Promise<User | null> {
  // getUser() validates the JWT against Supabase Auth — never trust getSession() server-side.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export async function assertAdmin(
  supabase: TypedSupabaseClient,
): Promise<{ user: User; profile: AdminProfile }> {
  const user = await getUser(supabase);
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("rider_profiles")
    .select("id, display_name, is_admin")
    .eq("id", user.id)
    .maybeSingle<AdminProfile>();

  if (!profile) redirect("/auth/provision");
  if (!profile.is_admin) redirect("/home");
  return { user, profile };
}
