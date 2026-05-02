import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

import { env } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

// Route Handler, not a Server Component: Server Components have a read-only
// cookie store, so exchangeCodeForSession would silently drop the session
// cookie writes. Route Handlers can attach Set-Cookie to the redirect response.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const errorParam = url.searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(new URL("/auth/error", url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/auth/error", url));
  }

  let response = NextResponse.redirect(new URL("/home", url));

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return NextResponse.redirect(new URL("/auth/error", url));
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.redirect(new URL("/auth/error", url));
  }

  const { data: profile } = await supabase
    .from("rider_profiles")
    .select("id")
    .eq("id", userData.user.id)
    .maybeSingle();

  // Rebuild the redirect with the resolved destination, copying the cookies
  // we already accumulated. NextResponse.redirect doesn't let you mutate the
  // Location after the fact, so build a fresh response and replay cookies.
  const destination = profile ? "/home" : "/auth/provision";
  const finalResponse = NextResponse.redirect(new URL(destination, url));
  for (const cookie of response.cookies.getAll()) {
    finalResponse.cookies.set(cookie);
  }
  return finalResponse;
}
