import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { env } from "@/lib/env";
import { rewriteForAdminHost } from "@/lib/proxy/admin-host";

export async function proxy(request: NextRequest) {
  const rewriteTarget = rewriteForAdminHost(
    request.headers.get("host"),
    request.nextUrl.pathname,
  );

  const buildResponse = () => {
    if (!rewriteTarget) return NextResponse.next({ request });
    const url = request.nextUrl.clone();
    url.pathname = rewriteTarget;
    return NextResponse.rewrite(url);
  };

  let response = buildResponse();

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = buildResponse();
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Touching getUser() forces a token-refresh round-trip so the
  // 90-day refresh-token cookie stays alive on every request.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
